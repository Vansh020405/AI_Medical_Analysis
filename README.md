# AI Medical Report Analyzer

Understand Your Health, Instantly

Upload your medical reports, and our secure AI will help you understand complex medical terms, test results, and more.

## Features

- **Confidential & Secure**: Your medical reports are encrypted and processed with the utmost confidentiality. We prioritize your privacy.
- **Intelligent Analysis**: Our AI breaks down complex medical jargon, lab results, and diagnoses into easy-to-understand language.
- **Ask Health Questions**: Get clear, AI-powered answers to help you prepare for doctor's appointments.

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Python (Flask)
- AI: OpenAI GPT, Sentence Transformers
- Additional Libraries: pdfplumber, pytesseract, scikit-learn

## Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd AI_Medical_Analysis
   ```

2. **Create and activate a virtual environment**
   ```bash
   python -m venv venv
   .\venv\Scripts\activate  # On Windows
   # or
   source venv/bin/activate  # On macOS/Linux
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**
   - Create a `.env` file in the project root
   - Add your OpenAI API key:
     ```
     OPENAI_API_KEY=your_api_key_here
     ```

5. **Install Tesseract OCR**
   - Download and install Tesseract OCR from https://github.com/UB-Mannheim/tesseract/wiki
   - Add Tesseract to your system PATH

6. **Run the application**
   ```bash
   python app.py
   ```
   - Open your browser and go to `http://localhost:5000`

## Usage

1. Upload a medical report (PDF, TXT, or CSV)
2. Ask questions about the report
3. Generate a structured clinical report

## Important Notes

- This application is for educational purposes only and is not a substitute for professional medical advice.
- Always consult with a qualified healthcare provider for medical advice.
- Your data is processed locally and not stored on any server.
