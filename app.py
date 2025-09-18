from flask import Flask, render_template, request, jsonify
import os
import csv
import pdfplumber
import pytesseract
from pdf2image import convert_from_path
import nltk
from sentence_transformers import SentenceTransformer
from sklearn.neighbors import NearestNeighbors
from openai import OpenAI
from werkzeug.utils import secure_filename
import traceback
import time, random

app = Flask(__name__)
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

nltk.download("punkt")

# Embeddings
embedder = SentenceTransformer("all-MiniLM-L6-v2")
def get_embedding(text):
    return embedder.encode(text)

# OpenAI client
client = OpenAI(api_key="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")

# Retry wrapper
def safe_chat_completion(**kwargs):
    for attempt in range(5):
        try:
            return client.chat.completions.create(**kwargs)
        except Exception as e:
            if "Rate limit" in str(e):
                wait = (2 ** attempt) + random.random()
                print(f"⚠️ Rate limited. Retrying in {wait:.1f}s...")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("❌ OpenAI request failed after retries.")

# File extractors
def extract_pages(pdf_path):
    pages_text = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                txt = page.extract_text() or ""
                pages_text.append(txt)
    except Exception:
        try:
            pages = convert_from_path(pdf_path)
            for page_img in pages:
                try:
                    pages_text.append(pytesseract.image_to_string(page_img))
                except Exception:
                    pages_text.append("")
        except Exception:
            return []
    return pages_text

def extract_txt(txt_path):
    try:
        with open(txt_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        return paragraphs if paragraphs else [content]
    except Exception:
        return []

def extract_csv(csv_path, max_cols=30):
    rows = []
    try:
        with open(csv_path, newline="", encoding="utf-8", errors="ignore") as f:
            reader = csv.reader(f)
            header = None
            for i, row in enumerate(reader):
                if i == 0:
                    header = row
                    continue
                if header:
                    pairs = []
                    for j, val in enumerate(row[:max_cols]):
                        key = header[j] if j < len(header) else f"col_{j+1}"
                        pairs.append(f"{key}: {val}")
                    rows.append(" | ".join(pairs))
                else:
                    rows.append(", ".join(row[:max_cols]))
    except Exception:
        return []
    return rows

# Chunking
def chunk_blocks(blocks, source_label, locator_label="page", chunk_size=200, overlap=60):
    chunks = []
    for idx, block_text in enumerate(blocks, start=1):
        words = nltk.word_tokenize(block_text or "")
        if not words:
            continue
        start = 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunk_words = words[start:end]
            if chunk_words:
                chunks.append({
                    "text": " ".join(chunk_words),
                    "source": source_label,
                    locator_label: idx,
                })
            if end == len(words):
                break
            start = end - overlap if end - overlap > 0 else end
    return chunks

# Ingestion
def ingest_file(saved_path, original_filename):
    _, ext = os.path.splitext(original_filename.lower())
    if ext == ".pdf":
        blocks = extract_pages(saved_path)
        return chunk_blocks(blocks, source_label=original_filename, locator_label="page")
    if ext == ".txt":
        blocks = extract_txt(saved_path)
        return chunk_blocks(blocks, source_label=original_filename, locator_label="para")
    if ext == ".csv":
        blocks = extract_csv(saved_path)
        return chunk_blocks(blocks, source_label=original_filename, locator_label="row")
    return []

# Index
def build_index(chunks):
    if not chunks:
        return None, [], []
    texts = [c["text"] for c in chunks]
    embeddings = [get_embedding(text) for text in texts]
    index = NearestNeighbors(metric="cosine")
    index.fit(embeddings)
    return index, chunks, embeddings

# Query
def query_corpus(query, index, chunks, embeddings):
    if index is None or not chunks:
        return "⚠️ No documents uploaded yet.", []
    query_vec = get_embedding(query).reshape(1, -1)
    n = min(5, len(embeddings))
    distances, indices = index.kneighbors(query_vec, n_neighbors=n)
    chosen = [chunks[i] for i in indices[0]]

    def ref_for(c):
        if "page" in c:
            return f"{c['source']} • page {c['page']}"
        if "row" in c:
            return f"{c['source']} • row {c['row']}"
        if "para" in c:
            return f"{c['source']} • paragraph {c['para']}"
        return c.get("source", "")

    context = "\n\n".join([f"[{ref_for(c)}]\n{c['text']}" for c in chosen])
    references = [ref_for(c) for c in chosen]

    completion = safe_chat_completion(
        model="gpt-4o-mini",
        temperature=0,
        messages=[
            {"role": "system", "content": (
                "Answer strictly from the provided document context. "
                "If the answer is not clearly present, reply: 'I couldn't find this in the uploaded documents.' "
                "Otherwise, structure reply as: 1) Short direct answer; "
                "2) Detailed explanation in bullets; 3) References; "
                "4) Helpful next-step suggestion. "
                "Highlight key terms with **bold**."
            )},
            {"role": "user", "content": f"Context with references:\n{context}\n\nQuestion: {query}"}
        ]
    )
    answer_text = completion.choices[0].message.content
    return answer_text, references

# Structured Report
def generate_structured_report(index, chunks, embeddings):
    if index is None or not chunks:
        return "⚠️ No documents uploaded yet."
    context = "\n\n".join([f"[{c['source']}]\n{c['text']}" for c in chunks[:10]])

    completion = safe_chat_completion(
        model="gpt-4o-mini",
        temperature=0,
        messages=[
            {"role": "system", "content": (
                "You are a clinical AI assistant. Generate a **Structured Clinical Report** "
                "with the following sections:\n"
                "1. **Structured Report** – A single, clinician-friendly overview.\n"
                "2. **Ranked Diagnosis List** – Probable diagnoses with confidence levels and justification.\n"
                "3. **Red-Flag Alerts** – Urgent conditions with escalation urgency.\n"
                "4. **Risk Stratification** – Categorize as Low / Medium / High with key drivers.\n"
                "5. **Explainability Pack** – Map outputs to specific patient data points.\n"
                "6. **Validation Notes** – Document assumptions, review checkpoints, robustness checks."
            )},
            {"role": "user", "content": f"Context:\n{context}\n\nGenerate the structured report."}
        ]
    )
    return completion.choices[0].message.content
def generate_ranked_diagnosis(index, chunks, embeddings):
    if index is None or not chunks:
        return "⚠️ No documents uploaded yet."
    context = "\n\n".join([f"[{c['source']}]\n{c['text']}" for c in chunks[:10]])

    completion = safe_chat_completion(
        model="gpt-4o-mini",
        temperature=0,
        messages=[
            {"role": "system", "content": (
                "You are a clinical AI assistant. Based strictly on the provided context, "
                "generate a **Ranked Diagnosis List** with:\n"
                "- Probable diagnoses (ranked in descending likelihood)\n"
                "- Confidence levels (High / Medium / Low)\n"
                "- Justification tied to evidence from patient data"
            )},
            {"role": "user", "content": f"Context:\n{context}\n\nGenerate the ranked diagnosis list."}
        ]
    )
    return completion.choices[0].message.content

    # Red-Flag Alerts
def generate_red_flag_alerts(index, chunks, embeddings):
    if index is None or not chunks:
        return "⚠️ No documents uploaded yet."
    
    context = "\n\n".join([f"[{c['source']}]\n{c['text']}" for c in chunks[:10]])

    completion = safe_chat_completion(
        model="gpt-4o-mini",
        temperature=0,
        messages=[
            {"role": "system", "content": (
                "You are a clinical AI assistant. From the provided context, "
                "detect urgent medical conditions (Red-Flag Alerts), such as sepsis, stroke, etc. "
                "For each alert, include:\n"
                "- Condition name\n"
                "- Priority level (High / Medium / Low)\n"
                "- Escalation instructions (e.g., immediate ER visit, urgent doctor consult)\n"
                "Highlight key terms in **bold**."
            )},
            {"role": "user", "content": f"Context:\n{context}\n\nGenerate Red-Flag Alerts with prioritization and escalation."}
        ]
    )
    return completion.choices[0].message.content

# Global store
uploaded_chunks = []
index, embeddings = None, None
structured_report_log = []

# Routes
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload_file():
    global uploaded_chunks, index, embeddings
    try:
        file = request.files["file"]
        if not file:
            return jsonify({"error": "No file provided"}), 400
        filename = secure_filename(file.filename)
        path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(path)
        chunks = ingest_file(path, filename)
        uploaded_chunks.extend(chunks)
        index, uploaded_chunks, embeddings = build_index(uploaded_chunks)
        return jsonify({"message": f"File '{filename}' uploaded & processed.", "chunks_added": len(chunks)})
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route("/ask", methods=["POST"])
def ask():
    try:
        data = request.json
        query = data.get("query", "")
        answer, refs = query_corpus(query, index, uploaded_chunks, embeddings)
        return jsonify({"answer": answer, "references": refs})
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route("/structured-report", methods=["GET"])
def structured_report():
    try:
        report = generate_structured_report(index, uploaded_chunks, embeddings)
        return jsonify({"report": report})
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route("/ranked-diagnosis", methods=["GET"])
def get_ranked_diagnosis():
    try:
        diagnosis = generate_ranked_diagnosis(index, uploaded_chunks, embeddings)
        return jsonify({"diagnosis": diagnosis})
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route("/red-flag-alerts", methods=["GET"])
def get_red_flag_alerts():
    try:
        alerts = generate_red_flag_alerts(index, uploaded_chunks, embeddings)
        return jsonify({"alerts": alerts})
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

if __name__ == "__main__":
    app.run(debug=True)
