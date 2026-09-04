#  OCR Demo Viewer

> **A demonstration tool for handwriting recognition** using OpenAI Vision with automatic fallback to Gemini Vision, featuring circuit breaker pattern for reliability.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.x-blue.svg)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](https://expressjs.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Vision-orange.svg)](https://openai.com/)
[![Gemini](https://img.shields.io/badge/Gemini-Vision-blueviolet.svg)](https://ai.google.dev/)

##  Overview

**OCR Demo Viewer** is a web-based demonstration tool that showcases handwriting recognition capabilities using:

- **Primary Provider:** OpenAI Vision (`gpt-4o` for math, `gpt-4o-mini` for others)
- **Fallback Provider:** Google Gemini Vision (`gemini-3.5-flash`)
- **Reliability Pattern:** Circuit breaker for automatic failover
- **Context-Aware:** Subject selection drives model choice (math → `gpt-4o` + high detail)

This tool is designed for your team to:

1. **Upload handwritten PNG images** and see real recognition results
2. **Understand the fallback mechanism** when OpenAI is unavailable
3. **Observe circuit breaker behavior** in real-time
4. **Compare recognition accuracy** with ground truth

---

##  Features

| Feature | Description |
|---------|-------------|
|  **PNG Upload** | Drag & drop or click to upload handwriting images |
|  **Handwriting Recognition** | Uses OpenAI Vision API with LaTeX support for math |
|  **Automatic Fallback** | Seamlessly switches to Gemini Vision if OpenAI fails |
|  **Circuit Breaker** | Prevents cascading failures with automatic recovery |
|  **Real-time Results** | Shows recognized text, provider, timing, and confidence |
|  **Math Detection** | Identifies and preserves mathematical notation with LaTeX |
|  **Ground Truth Comparison** | Compare recognized text with expected text |
|  **Context-Based Model Selection** | Math subjects → `gpt-4o` + high detail |
|  **Breaker Controls** | View status and manually reset the circuit breaker |
|  **Performance Metrics** | View timing, file size, and provider statistics |

---

##  Architecture
┌─────────────────────────────────────────────────────────────────────────────┐
│ OCR DEMO VIEWER │
│ │
│ ┌──────────────────────┐ ┌──────────────────────────────────┐ │
│ │ FRONTEND │ │ BACKEND │ │
│ │ (Vite + React) │ HTTP │ (Express + Multer) │ │
│ │ │◄──────────┤ │ │
│ │ ┌────────────────┐ │ │ ┌──────────────────────────┐ │ │
│ │ │ Uploader │ │ │ │ Controller │ │ │
│ │ │ (PNG only) │ │ │ │ ├─ PNG validation │ │ │
│ │ └────────────────┘ │ │ │ ├─ Context parsing │ │ │
│ │ ┌────────────────┐ │ │ │ └─ Service invocation │ │ │
│ │ │ Context Form │ │ │ └──────────────────────────┘ │ │
│ │ │ (subject, │ │ │ │ │ │
│ │ │ topic, class)│ │ │ ▼ │ │
│ │ └────────────────┘ │ │ ┌──────────────────────────┐ │ │
│ │ ┌────────────────┐ │ │ │ Recognition Service │ │ │
│ │ │ Result Panel │ │ │ │ (UNCHANGED from prod) │ │ │
│ │ │ ├─ text │ │ │ │ │ │ │
│ │ │ ├─ provider │ │ │ │ ┌────────────────────┐ │ │ │
│ │ │ ├─ degraded │ │ │ │ │ Circuit Breaker │ │ │ │
│ │ │ ├─ has_math │ │ │ │ │ (opossum) │ │ │ │
│ │ │ └─ elapsed │ │ │ │ └────────┬───────────┘ │ │ │
│ │ └────────────────┘ │ │ │ │ │ │ │
│ │ ┌────────────────┐ │ │ │ ┌────────▼───────────┐ │ │ │
│ │ │ Breaker Status │ │ │ │ │ OpenAI Vision │ │ │ │
│ │ │ (health check)│ │ │ │ │ (gpt-4o/mini) │ │ │ │
│ │ └────────────────┘ │ │ │ └────────┬───────────┘ │ │ │
│ └──────────────────────┘ │ │ ┌────────▼───────────┐ │ │ │
│ │ │ │ Gemini Vision │ │ │ │
│ │ │ │ (fallback) │ │ │ │
│ │ │ └────────────────────┘ │ │ │
│ │ └──────────────────────────┘ │ │
└─────────────────────────────────────────────────────────────────────────────┘

### Request Flow

1. **User uploads PNG** via React frontend
2. **Express server** receives multipart request with `multer`
3. **Controller validates** PNG (magic bytes) and extracts context
4. **Recognition service** (unchanged from production) processes the request
5. **OpenAI Vision** attempts recognition (or **Gemini** if OpenAI fails)
6. **Circuit breaker** tracks failures and triggers fallback
7. **Result** returned to frontend with provider and telemetry

---

##  Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/adityayadavms/ocr-demo-viewer.git
cd ocr-demo-viewer

# 2. Install dependencies
npm install
cd web && npm install && cd ..

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# 4. Start the application
# Terminal 1: Backend
npm run dev:server

# Terminal 2: Frontend
npm run dev:web

# 5. Open browser
# http://localhost:5173

```


Subject: Select "Mathematics" for better math recognition

Topic: Enter "Quadratic equations" (optional)

Class: Enter "10" (optional)

5. Recognize
Click "Recognize"

Wait for the result (typically 2-5 seconds)

6. Interpret Results
Badge	Meaning
   openai	OpenAI Vision used (normal)
   gemini	Gemini fallback used (degraded)
   degraded	Fallback was triggered
   math	Mathematical notation detected
   illegible	No readable text found
7. Ground Truth (Optional)
Paste expected text in the "Ground Truth" box

See exact match comparison

8. Circuit Breaker Status
Click "Check Breaker" to see current status

Click "Reset Breaker" to manually restore normal operation

9. Demonstrate Fallback
In .env, set OPENAI_API_KEY=sk-invalid

Restart the server

Upload 3+ images

Watch the breaker go CLOSED → OPEN

UI shows provider: gemini with degraded: true

Fix the API key

Click "Reset Breaker"

API Reference
POST /recognize
Upload an image for handwriting recognition.

Request:

Method: POST

Content-Type: multipart/form-data

Fields:

boardImage: PNG file (required)

subject: string (optional) → Drives model selection

topic: string (optional) → Context for disambiguation

class: string (optional) → Grade/level context

Response (Success):

json
{
  "text": "x^2 + 3x + 2 = 0",
  "provider": "openai" | "gemini" | null,
  "degraded": boolean,
  "has_math": boolean,
  "legible": boolean,
  "message": string,
  "_elapsedMs": number,
  "_fileSizeKB": number,
  "_usedContext": {
    "subject": string,
    "topic": string,
    "class": string
  }
}
Response (Error):

json
{
  "error": "Error message",
  "code": "NO_FILE" | "BAD_TYPE" | "TOO_LARGE" | "RECOGNITION_FAILED"
}
GET /health
Get circuit breaker health status.

Response:

json
{
  "healthy": boolean,
  "breaker": {
    "state": "CLOSED" | "OPEN" | "HALF-OPEN" | "UNKNOWN",
    "failures": number,
    "successes": number,
    "rejects": number,
    "fallbacks": number,
    "status": string
  },
  "config": {
    "timeout": number,
    "errorThreshold": number,
    "volumeThreshold": number,
    "resetTimeout": number,
    "maxImageMB": number,
    "retryCount": number
  },
  "timestamp": string
}
POST /reset-breaker
Manually reset the circuit breaker to CLOSED state.

Response:

json
{
  "success": boolean,
  "message": string,
  "timestamp": string
}
