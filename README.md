# OCR Demo Viewer

> A demonstration tool for **handwriting recognition** using OpenAI Vision with automatic fallback to Gemini Vision, protected by a circuit-breaker pattern for reliability.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.x-blue.svg)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](https://expressjs.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Vision-orange.svg)](https://openai.com/)
[![Gemini](https://img.shields.io/badge/Gemini-Vision-blueviolet.svg)](https://ai.google.dev/)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Usage Guide](#usage-guide)
- [Demonstrating the Fallback / Circuit Breaker](#demonstrating-the-fallback--circuit-breaker)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## Overview

**OCR Demo Viewer** is a web-based tool that showcases handwriting recognition using two vision providers with automatic failover:

- **Primary provider:** OpenAI Vision — `gpt-4o` for math, `gpt-4o-mini` for other subjects
- **Fallback provider:** Google Gemini Vision — `gemini-3.5-flash`
- **Reliability pattern:** A circuit breaker (via `opossum`) that trips to the fallback when the primary starts failing
- **Context-aware:** The selected subject drives model choice (e.g. math → `gpt-4o` with high detail)

The tool lets you:

1. Upload handwritten PNG images and see real recognition results.
2. Understand the fallback mechanism when OpenAI is unavailable.
3. Observe circuit-breaker behavior in real time.
4. Compare recognized text against a ground-truth string.

---

## Features

| Feature | Description |
|---------|-------------|
| **PNG Upload** | Drag & drop or click to upload handwriting images |
| **Handwriting Recognition** | OpenAI Vision API with LaTeX support for math |
| **Automatic Fallback** | Seamlessly switches to Gemini Vision if OpenAI fails |
| **Circuit Breaker** | Prevents cascading failures with automatic recovery |
| **Real-time Results** | Shows recognized text, provider, timing, and confidence |
| **Math Detection** | Identifies and preserves mathematical notation with LaTeX |
| **Ground-Truth Comparison** | Compare recognized text with expected text |
| **Context-Based Model Selection** | Math subjects → `gpt-4o` + high detail |
| **Breaker Controls** | View status and manually reset the circuit breaker |
| **Performance Metrics** | View timing, file size, and provider statistics |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite + React 18 |
| Backend | Node.js 20 + Express 4 |
| File uploads | Multer |
| Circuit breaker | opossum |
| Vision providers | OpenAI Vision, Google Gemini Vision |

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                            OCR DEMO VIEWER                                  │
│                                                                            │
│   ┌───────────────────────┐        ┌──────────────────────────────────┐   │
│   │       FRONTEND         │  HTTP  │             BACKEND               │   │
│   │    (Vite + React)      │◄──────►│       (Express + Multer)          │   │
│   │                        │        │                                   │   │
│   │  ┌──────────────────┐  │        │  ┌─────────────────────────────┐  │   │
│   │  │ Uploader         │  │        │  │ Controller                  │  │   │
│   │  │ (PNG only)       │  │        │  │  ├─ PNG validation          │  │   │
│   │  └──────────────────┘  │        │  │  ├─ Context parsing         │  │   │
│   │  ┌──────────────────┐  │        │  │  └─ Service invocation      │  │   │
│   │  │ Context Form     │  │        │  └──────────────┬──────────────┘  │   │
│   │  │ (subject, topic, │  │        │                 ▼                 │   │
│   │  │  class)          │  │        │  ┌─────────────────────────────┐  │   │
│   │  └──────────────────┘  │        │  │ Recognition Service         │  │   │
│   │  ┌──────────────────┐  │        │  │                             │  │   │
│   │  │ Result Panel     │  │        │  │  ┌───────────────────────┐  │  │   │
│   │  │  ├─ text         │  │        │  │  │ Circuit Breaker       │  │  │   │
│   │  │  ├─ provider     │  │        │  │  │ (opossum)             │  │  │   │
│   │  │  ├─ degraded     │  │        │  │  └───────────┬───────────┘  │  │   │
│   │  │  ├─ has_math     │  │        │  │              ▼              │  │   │
│   │  │  └─ elapsed      │  │        │  │  ┌───────────────────────┐  │  │   │
│   │  └──────────────────┘  │        │  │  │ OpenAI Vision         │  │  │   │
│   │  ┌──────────────────┐  │        │  │  │ (gpt-4o / gpt-4o-mini)│  │  │   │
│   │  │ Breaker Status   │  │        │  │  └───────────┬───────────┘  │  │   │
│   │  │ (health check)   │  │        │  │              ▼              │  │   │
│   │  └──────────────────┘  │        │  │  ┌───────────────────────┐  │  │   │
│   └───────────────────────┘        │  │  │ Gemini Vision         │  │  │   │
│                                     │  │  │ (fallback)            │  │  │   │
│                                     │  │  └───────────────────────┘  │  │   │
│                                     │  └─────────────────────────────┘  │   │
│                                     └──────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Request Flow

1. **User uploads a PNG** via the React frontend.
2. **Express** receives the multipart request with `multer`.
3. **Controller** validates the PNG (magic bytes) and extracts context.
4. **Recognition Service** processes the request.
5. **OpenAI Vision** attempts recognition (or **Gemini** if OpenAI fails).
6. **Circuit breaker** tracks failures and triggers the fallback.
7. **Result** is returned to the frontend with provider and telemetry.

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 20.x** or later — [download](https://nodejs.org/)
- **npm 9+** (bundled with Node.js)
- **Git**
- An **OpenAI API key** with access to `gpt-4o` and `gpt-4o-mini` — [get one](https://platform.openai.com/api-keys)
- A **Google Gemini API key** — [get one](https://aistudio.google.com/app/apikey)

Verify your Node version:

```bash
node -v   # should print v20.x.x or higher
```

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/adityayadavms/ocr-demo-viewer.git
cd ocr-demo-viewer
```

### 2. Install dependencies

Install both the backend (root) and frontend (`web`) dependencies:

```bash
# Backend dependencies (root)
npm install

# Frontend dependencies
cd web
npm install
cd ..
```

### 3. Configure environment variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env
```

Then open `.env` and add your API keys (see [Environment Variables](#environment-variables) below).

### 4. Start the application

Run the backend and frontend in two separate terminals:

```bash
# Terminal 1 — Backend (Express API)
npm run dev:server

# Terminal 2 — Frontend (Vite dev server)
npm run dev:web
```

### 5. Open the app

Visit **http://localhost:5173** in your browser.

> The frontend runs on port `5173` (Vite default) and talks to the backend on the `PORT` you configure in `.env` (default `3000`).

---

## Environment Variables

Create a `.env` file in the project root. All variables below are read by the backend.

```env
# ── Server ────────────────────────────────────────────────
PORT=3000

# ── Provider API keys (required) ──────────────────────────
OPENAI_API_KEY=sk-your-openai-key-here
GEMINI_API_KEY=your-gemini-key-here

# ── Model selection (optional overrides) ──────────────────
# Math subjects use the high-detail model, others use the mini model.
OPENAI_MODEL_MATH=gpt-4o
OPENAI_MODEL_DEFAULT=gpt-4o-mini
# NOTE: confirm this against a currently available Gemini model name.
GEMINI_MODEL=gemini-3.5-flash

# ── Circuit breaker configuration (optional) ──────────────
BREAKER_TIMEOUT=15000          # ms before a call is considered failed
BREAKER_ERROR_THRESHOLD=50     # % of failures that trips the breaker
BREAKER_VOLUME_THRESHOLD=3     # min requests before the breaker can trip
BREAKER_RESET_TIMEOUT=30000    # ms before the breaker tries HALF-OPEN
RETRY_COUNT=1                  # retries against the primary before fallback

# ── Upload limits (optional) ──────────────────────────────
MAX_IMAGE_MB=5                 # max upload size in MB
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Port the Express server listens on |
| `OPENAI_API_KEY` | **Yes** | — | OpenAI API key (primary provider) |
| `GEMINI_API_KEY` | **Yes** | — | Google Gemini API key (fallback provider) |
| `OPENAI_MODEL_MATH` | No | `gpt-4o` | Model used for math subjects |
| `OPENAI_MODEL_DEFAULT` | No | `gpt-4o-mini` | Model used for non-math subjects |
| `GEMINI_MODEL` | No | `gemini-3.5-flash` | Fallback model |
| `BREAKER_TIMEOUT` | No | `15000` | Call timeout in ms |
| `BREAKER_ERROR_THRESHOLD` | No | `50` | Failure % that trips the breaker |
| `BREAKER_VOLUME_THRESHOLD` | No | `3` | Min requests before tripping |
| `BREAKER_RESET_TIMEOUT` | No | `30000` | Cooldown before retrying the primary |
| `RETRY_COUNT` | No | `1` | Primary retries before fallback |
| `MAX_IMAGE_MB` | No | `5` | Max upload size in MB |

> Verify the exact variable names against your `.env.example`, and adjust the defaults above if your codebase differs.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:server` | Start the Express backend in development mode |
| `npm run dev:web` | Start the Vite frontend dev server |

> If your `package.json` defines additional scripts (e.g. `build`, `start`, `lint`), document them here as well.

---

## Project Structure

```text
ocr-demo-viewer/
├── src/                 # Backend (Express) source
│   ├── controller/      # Request handling, PNG validation, context parsing
│   ├── service/         # Recognition service + circuit breaker (opossum)
│   └── server.js        # Express entry point
├── web/                 # Frontend (Vite + React)
│   ├── src/
│   │   ├── components/   # Uploader, Context Form, Result Panel, Breaker Status
│   │   └── App.jsx
│   └── package.json
├── .env.example         # Environment variable template
├── .env                 # Your local secrets (git-ignored)
├── package.json
└── README.md
```

> This is a representative layout — adjust it to match the actual folders in your repository.

---

## Usage Guide

1. **Upload an image** — drag & drop or click to select a PNG of handwriting.
2. **Select a subject** — choose *Mathematics* for better math recognition.
3. **Enter a topic** *(optional)* — e.g. `Quadratic equations`.
4. **Enter a class** *(optional)* — e.g. `10`.
5. **Click "Recognize"** — results typically appear in 2–5 seconds.
6. **Interpret the result badges:**

| Badge | Meaning |
|-------|---------|
| `openai` | OpenAI Vision used (normal operation) |
| `gemini` | Gemini fallback used (degraded) |
| `degraded` | Fallback was triggered |
| `math` | Mathematical notation detected |
| `illegible` | No readable text found |

7. **Ground truth** *(optional)* — paste the expected text to see an exact-match comparison.
8. **Circuit breaker** — click **Check Breaker** to view status, or **Reset Breaker** to restore normal operation.

---

## Demonstrating the Fallback / Circuit Breaker

To see the fallback and circuit breaker in action:

1. In `.env`, set an invalid key: `OPENAI_API_KEY=sk-invalid`.
2. Restart the backend server.
3. Upload 3 or more images.
4. Watch the breaker transition **CLOSED → OPEN**.
5. The UI now shows `provider: gemini` with `degraded: true`.
6. Restore the correct API key.
7. Click **Reset Breaker** to return to normal operation.

---

## API Reference

### `POST /recognize`

Upload an image for handwriting recognition.

**Request**

- **Method:** `POST`
- **Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `boardImage` | PNG file | Yes | The handwriting image |
| `subject` | string | No | Drives model selection |
| `topic` | string | No | Context for disambiguation |
| `class` | string | No | Grade/level context |

**Response — success**

```json
{
  "text": "x^2 + 3x + 2 = 0",
  "provider": "openai",
  "degraded": false,
  "has_math": true,
  "legible": true,
  "message": "",
  "_elapsedMs": 2431,
  "_fileSizeKB": 184,
  "_usedContext": {
    "subject": "Mathematics",
    "topic": "Quadratic equations",
    "class": "10"
  }
}
```

`provider` may be `"openai"`, `"gemini"`, or `null`.

**Response — error**

```json
{
  "error": "Error message",
  "code": "NO_FILE"
}
```

`code` may be `NO_FILE`, `BAD_TYPE`, `TOO_LARGE`, or `RECOGNITION_FAILED`.

---

### `GET /health`

Get circuit-breaker health status.

```json
{
  "healthy": true,
  "breaker": {
    "state": "CLOSED",
    "failures": 0,
    "successes": 12,
    "rejects": 0,
    "fallbacks": 0,
    "status": "healthy"
  },
  "config": {
    "timeout": 15000,
    "errorThreshold": 50,
    "volumeThreshold": 3,
    "resetTimeout": 30000,
    "maxImageMB": 5,
    "retryCount": 1
  },
  "timestamp": "2026-09-04T10:00:00.000Z"
}
```

`state` may be `CLOSED`, `OPEN`, `HALF-OPEN`, or `UNKNOWN`.

---

### `POST /reset-breaker`

Manually reset the circuit breaker to the `CLOSED` state.

```json
{
  "success": true,
  "message": "Circuit breaker reset",
  "timestamp": "2026-09-04T10:00:00.000Z"
}
```

---

## Troubleshooting

| Problem | Likely cause / fix |
|---------|--------------------|
| `EADDRINUSE` on startup | The `PORT` is already in use — change `PORT` in `.env` or stop the other process. |
| Frontend can't reach the backend | Confirm the backend is running and the frontend's API base URL points to the correct `PORT`. |
| Every request returns `gemini` / `degraded: true` | Your `OPENAI_API_KEY` is missing or invalid, or the breaker is `OPEN` — fix the key and click **Reset Breaker**. |
| `BAD_TYPE` error | Only PNG files are accepted. Convert other formats to PNG first. |
| `TOO_LARGE` error | The image exceeds `MAX_IMAGE_MB` — reduce the file size or raise the limit. |
| Recognition never returns | Check your network and that both API keys are valid; inspect the backend logs. |
| `npm install` fails | Ensure Node.js is 20.x+ and delete `node_modules` + `package-lock.json`, then reinstall. |

---
