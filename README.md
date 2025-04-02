# PDF to Audiobook Converter

This application converts PDF documents into audiobooks, providing a synchronized text display that highlights the currently spoken word. It consists of two parts:

1. A Next.js frontend for uploading PDFs and playing the generated audio
2. A Python Flask backend API that processes PDF text using the Groq API and generates audio using Kokoro TTS

## Features

- PDF upload and viewing with page navigation
- High-quality text-to-speech conversion using Kokoro TTS
- Text segmentation for natural-sounding audio
- Word-level text synchronization with audio playback
- Multiple voice options with different speaking styles
- Advanced playback controls (play/pause, skip forward/backward)
- Audio visualization with progress indication
- Caching system for faster repeated playback
- Responsive design with dark theme

## Project Structure

The application is divided into two main components:

### Backend (`/Backend`)
- Flask API for processing PDF text and generating audio
- Groq API integration for text segmentation
- Kokoro TTS for high-quality voice synthesis
- Word-level timing calculation for precise synchronization

### Frontend (`/Frontend`)
- Next.js application with TypeScript and Tailwind CSS
- PDF viewer with page navigation
- Audio player with visualization
- Context provider for state management
- Word-level highlighting synchronized with audio

## Prerequisites

- Node.js 18+ and npm
- Python 3.8+
- ffmpeg (for audio processing)
- Groq API key (sign up at https://console.groq.com/)

## Setup

### Backend Setup

1. Navigate to the Backend directory:
   ```
   cd Backend
   ```

2. Create a virtual environment and install dependencies:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. Create a `.env` file in the Backend directory with your Groq API key:
   ```
   GROQ_API_KEY=your-api-key-here
   ```

4. Start the backend server:
   ```
   python pdf-to-audio-api.py
   ```
   The API will be available at http://localhost:4567

### Frontend Setup

1. Navigate to the Frontend directory:
   ```
   cd Frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```
   The application will be available at http://localhost:3199

## Usage

1. Open the application in your browser at http://localhost:3199
2. Upload a PDF file using the upload section
3. Once the PDF is loaded, navigate through pages using the page controls
4. Click the "Play" button to generate audio for the current page
5. Audio will play with synchronized text highlighting
6. Use the audio player controls to play/pause and navigate the audio
7. Select different voices from the settings menu in the audio player

## Synchronization Features

The application provides word-level synchronization between the audio and text:

- Words are highlighted as they are spoken in the audio
- The system calculates precise timing for each word based on:
  - Character count and estimated speaking rate
  - Word complexity and length
  - Punctuation and natural pauses
  - Sentence structure

## API Endpoints

The backend provides the following API endpoints:

- `GET /api/health` - Health check endpoint
- `POST /api/process-page` - Process a page of text and generate audio
- `GET /api/audio/<filename>` - Retrieve a generated audio file
- `GET /api/voices` - List available TTS voices

## Technologies Used

### Backend
- Python 3.8+
- Flask for the API server
- Groq API for text processing (using the Llama-3.3-70B model)
- Kokoro TTS for audio generation
- SoundFile and NumPy for audio processing
- Concurrent processing for improved performance

### Frontend
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- pdf.js for PDF rendering
- Context API for state management

## Troubleshooting

- If you encounter audio synchronization issues, try adjusting the timing parameters in the `pdf-context.tsx` file
- For audio generation failures, check the backend logs for detailed error messages
- Make sure your Groq API key is valid and has sufficient quota

## License

MIT 