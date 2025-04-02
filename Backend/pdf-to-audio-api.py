#!/usr/bin/env python3
"""
PDF-to-AudioBook API (Groq Version)

This Flask API provides endpoints for:
1. Receiving page text from a PDF frontend
2. Processing the text with Groq API to convert it into a structured JSON format with segments
3. Generating audio using Kokoro TTS 
4. Serving the audio back to the frontend

Usage:
    python pdf-to-audio-api.py
"""

import os
import json
import time
import re
import base64
import tempfile
import threading
import concurrent.futures
from queue import Queue
from datetime import datetime
from dotenv import load_dotenv
import tiktoken  # For token counting
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import groq
from kokoro import KPipeline
import soundfile as sf
import numpy as np
from pydub import AudioSegment
from pydub.utils import which

# Load environment variables from .env file
dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
load_dotenv(dotenv_path)

# Check if GROQ_API_KEY is set
if not os.environ.get("GROQ_API_KEY"):
    print("[Error] GROQ_API_KEY environment variable is not set. Please add it to your .env file.")
    exit(1)

# Constants
MAX_TOKENS = 100000       # For LLM call (assumes each page is below this limit)
RETRY_LIMIT = 3           # Number of times to retry the API call
TTS_MAX_TOKENS = 100      # Maximum token capacity for Kokoro TTS input per chunk
AUDIO_CACHE_DIR = "audio_cache"  # Directory to cache generated audio files
MAX_WORKERS = 4           # Maximum number of parallel workers for audio generation

# Create cache directory if it doesn't exist
os.makedirs(AUDIO_CACHE_DIR, exist_ok=True)

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize Groq client
groq_client = groq.Groq(api_key=os.environ.get("GROQ_API_KEY"))

# Check for ffmpeg (required by pydub)
if not which("ffmpeg"):
    print("[Error] ffmpeg not found. Please install ffmpeg for audio merging to work properly.")

# Initialize tiktoken encoding (will be loaded on first use)
_encoding = None

# Create a global TTS pipeline object to reuse
_tts_pipelines = {}
_tts_pipelines_lock = threading.Lock()

def get_tts_pipeline(voice="af_heart"):
    """Get or initialize the TTS pipeline for a specific voice."""
    global _tts_pipelines
    with _tts_pipelines_lock:
        if voice not in _tts_pipelines:
            print(f"Initializing TTS pipeline for voice: {voice}")
            _tts_pipelines[voice] = KPipeline(lang_code='a')
        return _tts_pipelines[voice]

def get_encoding():
    """Get or initialize the tiktoken encoding."""
    global _encoding
    if _encoding is None:
        try:
            _encoding = tiktoken.get_encoding("cl100k_base")
        except Exception as e:
            print(f"Warning: Could not load tiktoken encoding: {e}")
            return None
    return _encoding

def count_tokens(text):
    """Count tokens in text using tiktoken."""
    encoding = get_encoding()
    if encoding is not None:
        return len(encoding.encode(text))
    else:
        return len(text) // 4

def split_text_by_tokens(text, max_tokens):
    """
    Splits text into chunks such that each chunk is no more than max_tokens tokens.
    """
    encoding = get_encoding()
    if not encoding:
        return [text]
    tokens = encoding.encode(text)
    chunks = []
    for i in range(0, len(tokens), max_tokens):
        chunk_tokens = tokens[i:i+max_tokens]
        chunk_text = encoding.decode(chunk_tokens)
        chunks.append(chunk_text)
    return chunks

def call_groq_api(page_text: str, page_number: int) -> dict:
    """
    Makes a single call to the Groq API to convert the page text into an audio book JSON structure.
    Returns the parsed dict if successful, or {} on error.
    
    Uses JSON mode to ensure a valid JSON response.
    """
    system_prompt = (
        "You are an assistant that converts extracted text from a book into a structured audio book script. "
        "For each input page, output a JSON object in the following format:\n"
        "{\n  \"page\": <page number>,\n  \"segments\": [\n"
        "    {\"speaker\": \"Narrator\", \"text\": \"<full text of the page split into segments (each no more than 100 tokens)>\"}\n"
        "  ]\n}\n\n"
        "IMPORTANT:\n"
        "1. Do NOT summarize, rephrase, or rewrite any text.\n"
        "2. Do NOT skip, omit, or truncate any portion of the text.\n"
        "3. Split the full page text into multiple segments such that each segment is no more than 100 tokens, "
        "and the concatenation of all segments exactly reproduces the input text (including all paragraphs and punctuation).\n"
        "4. Use the speaker \"Narrator\" for every segment.\n"
        "5. Even if the final segment is very short, include it in its entirety.\n"
        "Return valid JSON and nothing else."
    )

    user_prompt = (
        f"Convert the following extracted text from page {page_number} into the JSON format described. "
        "Split the text into segments so that each segment is no more than 100 tokens and the concatenation of all segments exactly equals the input text. "
        "Use the speaker \"Narrator\" for every segment. Do not summarize, rephrase, or change any part of the text. "
        "Do not omit any content:\n\n" + page_text
    )

    # Log the full prompts being sent to the LLM
    print(f"System prompt for page {page_number}:\n{system_prompt}\n")
    print(f"User prompt for page {page_number}:\n{user_prompt}\n")

    input_tokens = count_tokens(system_prompt) + count_tokens(user_prompt)
    print(f"Request contains {input_tokens} tokens for page {page_number}.")

    try:
        # Using Meta Llama 3 128K model which can handle up to 128K tokens
        response = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model="llama-3.3-70b-versatile",  # Using the 128K token context model
            temperature=0,
            max_tokens=32768,  # Using a high value, well within model's capacity
            response_format={"type": "json_object"}  # Enable JSON mode
        )
        
        raw_content = response.choices[0].message.content
        print(f"Raw JSON output for page {page_number}:\n{raw_content}\n")
        
        # Since we're using JSON mode, the response should always be valid JSON
        data = json.loads(raw_content)
        if not isinstance(data, dict) or "segments" not in data:
            print(f"[Error] Invalid JSON structure for page {page_number}. Expected a dict with 'segments'.")
            return {}
        return data
    except Exception as e:
        print(f"[Error] Exception calling Groq API for page {page_number}: {e}")
        return {}

def get_audio_book_segment(page_text: str, page_number: int, attempts=RETRY_LIMIT) -> dict:
    """
    Retries the Groq API call up to `attempts` times.
    Returns a valid JSON dict or an empty dict if all attempts fail.
    """
    for attempt in range(1, attempts + 1):
        data = call_groq_api(page_text, page_number)
        if data and isinstance(data, dict) and "segments" in data:
            return data
        print(f"[Warning] Attempt {attempt} failed for page {page_number}, retrying...")
        time.sleep(1)
    print(f"[Error] All {attempts} attempts failed for page {page_number}. Skipping this page.")
    return {}

def process_chunk(chunk, voice, chunk_index, total_chunks, results_queue):
    """Process a single TTS chunk in a separate thread."""
    try:
        chunk_token_count = count_tokens(chunk)
        print(f"Synthesizing chunk {chunk_index}/{total_chunks} with {chunk_token_count} tokens...")
        
        # Use the global pipeline for better performance
        pipeline = get_tts_pipeline(voice)
        generator = pipeline(chunk, voice=voice)
        
        audio_chunks = []
        for (gs, ps, audio) in generator:
            audio_chunks.append(audio)
        
        if not audio_chunks:
            print(f"[Warning] No audio was generated for chunk {chunk_index}.")
            results_queue.put((chunk_index, None))
            return
        
        # Concatenate numpy arrays
        all_audio = np.concatenate(audio_chunks)
        
        # Audio processing complete for this chunk
        results_queue.put((chunk_index, all_audio))
    except Exception as e:
        print(f"[Error] Exception processing chunk {chunk_index}: {e}")
        results_queue.put((chunk_index, None))

def synthesize_audio_parallel(text: str, output_filename: str, voice: str = "af_heart"):
    """
    Synthesizes audio from text using Kokoro TTS with parallel processing.
    """
    token_count = count_tokens(text)
    
    if token_count <= TTS_MAX_TOKENS:
        # For short text, just process directly
        pipeline = get_tts_pipeline(voice)
        generator = pipeline(text, voice=voice)
        audio_chunks = []
        for (gs, ps, audio) in generator:
            audio_chunks.append(audio)
        if audio_chunks:
            # Concatenate audio chunks
            all_audio = np.concatenate(audio_chunks)
            sf.write(output_filename, all_audio, 24000)
            print(f"Saved audio to: {output_filename}")
            return
        else:
            print("[Warning] No audio was generated for the given text.")
            return

    print(f"Text has {token_count} tokens which exceeds the TTS maximum of {TTS_MAX_TOKENS} tokens. Splitting text into chunks...")
    chunks = split_text_by_tokens(text, TTS_MAX_TOKENS)
    total_chunks = len(chunks)
    print(f"Split text into {total_chunks} chunks for parallel processing.")

    # Use a thread-safe queue to collect results
    results_queue = Queue()
    
    # Create thread pool
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(MAX_WORKERS, total_chunks)) as executor:
        # Submit tasks
        futures = []
        for i, chunk in enumerate(chunks, start=1):
            future = executor.submit(process_chunk, chunk, voice, i, total_chunks, results_queue)
            futures.append(future)
        
        # Wait for all futures to complete
        concurrent.futures.wait(futures)
    
    # Collect results in the correct order
    results = [None] * total_chunks
    while not results_queue.empty():
        idx, audio = results_queue.get()
        results[idx-1] = audio
    
    # Filter out None values (failed chunks)
    valid_results = [r for r in results if r is not None]
    
    if not valid_results:
        print("[Error] No audio was generated for any chunks.")
        return
    
    # Concatenate all audio chunks in the correct order
    final_audio = np.concatenate(valid_results)
    
    # Write final audio to file
    sf.write(output_filename, final_audio, 24000)
    print(f"Saved merged audio to: {output_filename}")

# Cache for text-to-segments mapping to avoid redundant API calls
segments_cache = {}

def process_page(page_text: str, page_number: int, voice: str = "af_heart"):
    """
    Processes a single page:
    1. Calls the Groq API (with retry) for the entire page text.
    2. Combines the returned segment(s) into a single string.
    3. Uses Kokoro TTS (with splitting if needed by token count) to generate one WAV file for the page.
    
    Returns:
    - filename: Path to the generated audio file
    - segments: List of segments with speaker and text
    - success: Boolean indicating if processing was successful
    """
    page_id = f"Page {page_number}"
    stripped_text = page_text.strip()

    if not stripped_text:
        print(f"[Warning] {page_id} is empty. Skipping.")
        return {"success": False, "error": "Page text is empty"}
    
    if len(stripped_text) < 100:
        print(f"[Warning] {page_id} is too short ({len(stripped_text)} chars). Skipping.")
        return {"success": False, "error": "Page text is too short"}

    # Create a unique identifier for this page based on content hash
    content_hash = abs(hash(stripped_text)) % 10000000000
    timestamp = datetime.now().strftime("%Y%m%d")
    cache_key = f"{timestamp}_{content_hash}_page_{page_number}"
    wav_filename = os.path.join(AUDIO_CACHE_DIR, f"{cache_key}.wav")
    
    # Check if we already have this audio cached
    if os.path.exists(wav_filename):
        print(f"Using cached WAV audio for {page_id}: {wav_filename}")
        
        # Check if we have cached segments
        cache_key_segments = f"{content_hash}_segments"
        if cache_key_segments in segments_cache:
            print(f"Using cached segments for {page_id}")
            return {
                "success": True, 
                "filename": wav_filename,
                "segments": segments_cache[cache_key_segments],
                "timing": "word_aligned"
            }
        
        # We need to get the segments for synchronized display
        data = get_audio_book_segment(stripped_text, page_number)
        if not data or "segments" not in data:
            return {"success": False, "error": "Failed to get segments from Groq API"}
        
        # Cache segments for future use
        segments_cache[cache_key_segments] = data.get("segments", [])
        return {
            "success": True, 
            "filename": wav_filename,
            "segments": data.get("segments", []),
            "timing": "word_aligned"
        }

    # Check if we have cached segments
    cache_key_segments = f"{content_hash}_segments"
    if cache_key_segments in segments_cache:
        print(f"Using cached segments for {page_id}")
        data = {"segments": segments_cache[cache_key_segments]}
    else:
        # Process with Groq API
        data = get_audio_book_segment(stripped_text, page_number)
        if not data:
            print(f"[Warning] No data for {page_id}, skipping.")
            return {"success": False, "error": "Failed to get data from Groq API"}
        
        # Cache segments for future use
        segments_cache[cache_key_segments] = data.get("segments", [])

    segments = data.get("segments", [])
    if not segments:
        print(f"[Warning] No segments returned for {page_id}, skipping.")
        return {"success": False, "error": "No segments returned from Groq API"}

    combined_text = " ".join(seg.get("text", "").strip() for seg in segments if seg.get("text", "").strip())
    if not combined_text.strip():
        print(f"[Warning] Combined text is empty for {page_id}, skipping.")
        return {"success": False, "error": "Combined text is empty"}

    print(f"Generating audio for {page_id} with {len(combined_text)} characters and {count_tokens(combined_text)} tokens.")
    
    # Generate audio in parallel
    start_time = time.time()
    synthesize_audio_parallel(combined_text, wav_filename, voice=voice)
    end_time = time.time()
    print(f"Audio generation took {end_time - start_time:.2f} seconds")
    
    # Calculate timing metadata for each segment
    try:
        # Get audio duration
        audio_info = sf.info(wav_filename)
        total_duration = audio_info.duration
        print(f"Audio duration: {total_duration:.2f} seconds")
        
        # First determine an average speaking rate (chars per second)
        # This is more accurate than using word count since word lengths vary
        total_chars = sum(len(segment["text"]) for segment in segments)
        avg_char_per_second = total_chars / total_duration
        print(f"Average speaking rate: {avg_char_per_second:.2f} chars/second")
        
        # Calculate better segment durations based on character counts
        enhanced_segments = []
        running_offset = 0.0  # Track the current position in seconds
        
        for segment in segments:
            segment_text = segment["text"]
            segment_chars = len(segment_text)
            
            # Estimate duration based on character count and speaking rate
            # Apply a rate adjustment based on punctuation density
            punctuation_count = sum(1 for char in segment_text if char in ".,;:!?-")
            punctuation_density = punctuation_count / max(1, segment_chars)
            
            # More punctuation means slower speech rate (more pauses)
            rate_factor = 1.0 + (punctuation_density * 5.0)  # Up to 6x slower for pure punctuation
            estimated_duration = (segment_chars / avg_char_per_second) * rate_factor
            
            enhanced_segment = {
                "speaker": segment["speaker"],
                "text": segment_text,
                "startTime": running_offset,
                "endTime": running_offset + estimated_duration
            }
            
            enhanced_segments.append(enhanced_segment)
            running_offset += estimated_duration
        
        # Scale all segment durations to match total audio duration
        scaling_factor = total_duration / running_offset
        for segment in enhanced_segments:
            segment["startTime"] *= scaling_factor
            segment["endTime"] *= scaling_factor
        
        # Generate word-level timing
        all_words = []  # Keep track of all words and their starting offsets
        
        for segment in enhanced_segments:
            segment_text = segment["text"]
            segment_start = segment["startTime"]
            segment_end = segment["endTime"]
            segment_duration = segment_end - segment_start
            
            # Split into words
            # Using regex to keep punctuation with the words
            import re
            words_with_punct = re.findall(r'\S+', segment_text)
            
            if not words_with_punct:
                continue
                
            # Calculate relative word positions with more sophisticated weighting
            word_timings = []
            segment_words_chars = sum(len(word) for word in words_with_punct)
            
            # Adjust for reading anomalies:
            # 1. Initial pause at paragraph start
            # 2. Longer pause after sentence punctuation
            # 3. Variable speed based on word complexity
            
            current_offset = segment_start
            for i, word in enumerate(words_with_punct):
                # Weight by character length primarily
                word_weight = len(word) / segment_words_chars
                
                # Apply special rules
                is_first_word = i == 0
                is_last_word = i == len(words_with_punct) - 1
                has_sentence_end_punct = re.search(r'[.!?]$', word) is not None
                is_complex_word = len(word) > 7  # Arbitrary threshold for "complex" words
                
                # Apply modifiers
                if is_first_word:
                    # First words may have a slight delay
                    current_offset += 0.05
                
                # Calculate this word's timing
                word_time = current_offset
                
                # Calculate duration for this word
                word_duration = segment_duration * word_weight
                
                # Apply special duration modifiers
                if has_sentence_end_punct:
                    word_duration *= 1.3  # 30% longer for sentence endings
                if is_complex_word:
                    word_duration *= 1.2  # 20% longer for complex words
                
                # Store word timing
                word_timings.append({
                    "word": word,
                    "time": word_time
                })
                
                # Keep track of all words for global word position
                all_words.append((word, word_time))
                
                # Update offset for next word
                current_offset += word_duration
            
            # Ensure the last word's timing still fits within the segment
            if word_timings:
                segment["wordTimings"] = word_timings
        
        # Print debug info about word timings
        if all_words:
            print(f"Calculated timings for {len(all_words)} words")
            print(f"First few words: {all_words[:5]}")
            print(f"Last few words: {all_words[-5:]}")
        
    except Exception as e:
        print(f"[Warning] Could not calculate timing info: {e}")
        enhanced_segments = segments
    
    return {
        "success": True,
        "filename": wav_filename,
        "segments": enhanced_segments,
        "timing": "word_aligned"
    }

# Define API routes
@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "service": "pdf-to-audio-api"})

@app.route("/api/process-page", methods=["POST"])
def api_process_page():
    """
    Process a page of text and return audio file and segments
    
    Expects a JSON payload with:
    - page_text: The text content of the page
    - page_number: The page number
    - voice: (optional) The voice to use for TTS
    
    Returns:
    - audio_url: URL to the generated audio file
    - segments: List of segments with speaker and text
    - success: Boolean indicating if processing was successful
    """
    try:
        data = request.json
        if not data or "page_text" not in data or "page_number" not in data:
            return jsonify({"success": False, "error": "Missing required parameters"}), 400
        
        page_text = data["page_text"]
        page_number = int(data["page_number"])
        voice = data.get("voice", "af_heart")
        
        result = process_page(page_text, page_number, voice)
        if not result["success"]:
            return jsonify(result), 400
        
        # Return the file URL and segments without duplicate /api prefix
        audio_filename = os.path.basename(result['filename'])
        audio_url = f"/audio/{audio_filename}"
        
        print(f"Returning audio URL: {audio_url}")
        
        return jsonify({
            "success": True,
            "audio_url": audio_url,
            "segments": result["segments"],
            "timing": "word_aligned"  # Add timing hint for frontend
        })
    
    except Exception as e:
        print(f"[Error] Exception in process_page API: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/audio/<filename>", methods=["GET"])
def get_audio(filename):
    """Serve an audio file from the cache directory"""
    try:
        file_path = os.path.join(AUDIO_CACHE_DIR, filename)
        if not os.path.exists(file_path):
            return jsonify({"success": False, "error": "Audio file not found"}), 404
        
        # Always use audio/wav mime type
        mimetype = "audio/wav"
        
        # Add CORS headers specifically for audio files
        response = send_file(file_path, mimetype=mimetype)
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'GET')
        response.headers.add('Cache-Control', 'public, max-age=3600')  # Cache for 1 hour
        return response
    
    except Exception as e:
        print(f"[Error] Exception serving audio file: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/voices", methods=["GET"])
def get_voices():
    """Return a list of available TTS voices"""
    # These are the voices available in Kokoro TTS
    voices = [
        {"id": "af_heart", "name": "Affectionate Heart", "language": "English"},
        {"id": "af_cane", "name": "Affectionate Cane", "language": "English"},
        {"id": "af_iris", "name": "Affectionate Iris", "language": "English"},
        {"id": "pe_leaf", "name": "Peaceful Leaf", "language": "English"},
        {"id": "pe_snow", "name": "Peaceful Snow", "language": "English"},
        {"id": "pe_vine", "name": "Peaceful Vine", "language": "English"}
    ]
    return jsonify({"success": True, "voices": voices})

if __name__ == "__main__":
    # Preload TTS model to improve first request performance
    print("Preloading TTS models...")
    get_tts_pipeline("af_heart")
    
    print("Starting PDF-to-Audio API with Groq integration")
    print(f"Audio cache directory: {os.path.abspath(AUDIO_CACHE_DIR)}")
    app.run(host="0.0.0.0", port=4567, debug=True) 