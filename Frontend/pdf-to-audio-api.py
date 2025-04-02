import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.exceptions import BadRequest
from pdf_to_audio import PDFToAudio

app = Flask(__name__)
CORS(app)

AUDIO_CACHE_DIR = ".cache"

@app.route('/convert', methods=['POST'])
def convert():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    filename = secure_filename(file.filename)
    file_path = os.path.join(AUDIO_CACHE_DIR, filename)

    file.save(file_path)

    try:
        pdf_to_audio = PDFToAudio(file_path)
        audio_path = pdf_to_audio.convert()
        return jsonify({"audio_path": audio_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/status', methods=['GET'])
def status():
    return jsonify({"status": "PDF-to-Audio API is running"})

if __name__ == "__main__":
    print("Starting PDF-to-Audio API with Groq integration")
    print(f"Audio cache directory: {os.path.abspath(AUDIO_CACHE_DIR)}")
    app.run(host="0.0.0.0", port=4567, debug=True) 