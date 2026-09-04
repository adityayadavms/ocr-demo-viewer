import { Router } from 'express';
import multer from 'multer';
import {
    recognize,
    health,
    resetBreaker,
} from '../controllers/recognize.controller.js';

// ── Multer Configuration ──
// memoryStorage gives us req.file.buffer — exactly what the service expects.
// File size limit matches HW_MAX_IMAGE_MB from .env
const MAX_FILE_SIZE_MB = Number(process.env.HW_MAX_IMAGE_MB) || 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        // Only one file per request
        files: 1,
    },
});

const router = Router();

// ── Routes ──
// The field name MUST be 'boardImage' — matches production contract
router.post('/recognize', upload.single('boardImage'), recognize);
router.get('/health', health);
router.post('/reset-breaker', resetBreaker);

export default router;