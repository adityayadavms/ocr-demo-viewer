import 'dotenv/config';  // ← MUST BE FIRST — services read env at construction

import express from 'express';
import cors from 'cors';
import routes from './routes/recognize.routes.js';

const app = express();

// ── Middleware ──
// CORS: In development, allow all origins. In production, lock down.
if (process.env.NODE_ENV === 'production') {
    // In production, restrict to your frontend origin
    app.use(cors({
        origin: process.env.FRONTEND_ORIGIN || 'https://your-app.com',
    }));
} else {
    app.use(cors()); // Allow all in development
}

app.use(express.json());

// ── Routes ──
app.use('/', routes);

// ── Error Handling ──
// Catch multer errors (file size, etc.)
app.use((err, req, res, next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            error: 'Image too large',
            code: 'TOO_LARGE',
            maxSizeMB: Number(process.env.HW_MAX_IMAGE_MB) || 10,
        });
    }
    
    // Multer other errors
    if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
            error: 'Unexpected file field. Use "boardImage".',
            code: 'BAD_FIELD',
        });
    }
    
    // Catch-all
    console.error('[Server] Unhandled error:', err);
    res.status(500).json({
        error: err?.message || 'Internal server error',
        code: 'INTERNAL_ERROR',
    });
});

// ── Start Server ──
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`[Server] OCR Demo Backend running on http://localhost:${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Server] OpenAI model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
    console.log(`[Server] Gemini model: ${process.env.GEMINI_MODEL || 'gemini-3.5-flash'}`);
});