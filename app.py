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


embedder = SentenceTransformer("all-MiniLM-L6-v2")

def get_embedding(text):
    return embedder.encode(text)

client = OpenAI(api_key="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")


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

def build_index(chunks):
    if not chunks:
        return None, [], []
    texts = [c["text"] for c in chunks]
    embeddings = [get_embedding(text) for text in texts]
    index = NearestNeighbors(metric="cosine")
    index.fit(embeddings)
    return index, chunks, embeddings

def query_corpus(query, index, chunks, embeddings):
    if index is None or not chunks:
        return "⚠️ No documents uploaded yet.", []
    query_vec = get_embedding(query).reshape(1, -1)
    distances, indices = index.kneighbors(query_vec, n_neighbors=5)
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

corpus_index = None
corpus_chunks = []
corpus_embeddings = None


@app.route("/", methods=["GET", "POST"])
def index():
    global corpus_index, corpus_chunks, corpus_embeddings
    answer = None
    message = None
    last_query = None
    uploaded_filename = None
    uploaded_size = None

    if request.method == "POST":
        try:
            files = request.files.getlist("files") if "files" in request.files else []
            if not files and "pdf" in request.files and request.files["pdf"].filename != "":
                files = [request.files["pdf"]]

            if files:
                total_new = 0
                for file in files:
                    if not file or file.filename == "":
                        continue
                    filename = secure_filename(file.filename)
                    save_path = os.path.join(UPLOAD_FOLDER, filename)
                    file.save(save_path)
                    new_chunks = ingest_file(save_path, filename)
                    if new_chunks:
                        corpus_chunks.extend(new_chunks)
                        total_new += len(new_chunks)
                        uploaded_filename = filename
                        try:
                            size_bytes = os.path.getsize(save_path)
                            uploaded_size = (
                                f"{size_bytes / (1024*1024):.2f} MB"
                                if size_bytes >= 1024*1024
                                else f"{size_bytes / 1024:.1f} KB"
                            )
                        except Exception:
                            uploaded_size = None
                corpus_index, corpus_chunks, corpus_embeddings = build_index(corpus_chunks)
                message = "✅ Files uploaded and processed!" if total_new else "⚠️ No supported files uploaded."

            elif "query" in request.form and corpus_index is not None:
                query = request.form.get("query")
                last_query = query
                answer, refs = query_corpus(query, corpus_index, corpus_chunks, corpus_embeddings)
                if refs:
                    answer += f"\n\nReferences: {', '.join(refs)}"
            else:
                message = "⚠️ Please upload documents first."
        except Exception as e:
            traceback.print_exc()
            message = f"❌ Upload failed: {str(e)[:200]}"

    return render_template(
        "index.html",
        answer=answer,
        message=message,
        last_query=last_query,
        uploaded_filename=uploaded_filename,
        uploaded_size=uploaded_size,
    )

@app.route("/upload", methods=["POST"])
def upload():
    global corpus_index, corpus_chunks, corpus_embeddings
    try:
        files = request.files.getlist("files") if "files" in request.files else []
        if not files and "pdf" in request.files and request.files["pdf"].filename != "":
            files = [request.files["pdf"]]
        if not files:
            return jsonify({"ok": False, "files": [], "errors": [{"filename": None, "error": "No file uploaded"}], "message": "No file uploaded"})

        uploaded = []
        errors = []
        for f in files:
            if not f or f.filename == "":
                continue
            try:
                filename = secure_filename(f.filename)
                save_path = os.path.join(UPLOAD_FOLDER, filename)
                f.save(save_path)
                new_chunks = ingest_file(save_path, filename)
                if new_chunks:
                    corpus_chunks.extend(new_chunks)
                    try:
                        size_bytes = os.path.getsize(save_path)
                        size_label = (
                            f"{size_bytes / (1024*1024):.2f} MB"
                            if size_bytes >= 1024*1024
                            else f"{size_bytes / 1024:.1f} KB"
                        )
                    except Exception:
                        size_label = None
                    uploaded.append({"filename": filename, "size": size_label, "chunks": len(new_chunks)})
                else:
                    errors.append({"filename": filename, "error": "Unsupported or unreadable file"})
            except Exception as e:
                traceback.print_exc()
                errors.append({"filename": getattr(f, 'filename', 'unknown'), "error": str(e)[:200]})

        corpus_index, corpus_chunks, corpus_embeddings = build_index(corpus_chunks)
        ok = len(uploaded) > 0
        status_message = "✅ Files uploaded and processed" if ok else "❌ No files processed"
        return jsonify({"ok": ok, "files": uploaded, "errors": errors, "message": status_message})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "files": [], "errors": [{"filename": None, "error": str(e)[:200]}], "message": "Upload failed"})

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)
