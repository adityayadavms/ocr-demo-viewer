import { handwritingRecognitionService } from '../services/handwriting-recognition.service.js';

// ── PNG Magic Bytes ──
// PNG files start with: 89 50 4E 47 0D 0A 1A 0A
function isPng(buffer) {
    if (!buffer || buffer.length < 8) return false;
    const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    return sig.every((byte, i) => buffer[i] === byte);
}

/**
 * POST /recognize
 * 
 * Expected multipart/form-data:
 *   - boardImage: PNG file (required)
 *   - subject: string (optional) → drives model selection
 *   - topic: string (optional) → context for disambiguation
 *   - class: string (optional) → grade/level context
 * 
 * Returns:
 *   - All fields from the recognition service:
 *     { text, provider, degraded, has_math, legible, message }
 *   - Plus demo telemetry: _elapsedMs, _fileSizeKB, _usedContext
 */
export async function recognize(req, res) {
    const started = Date.now();

    // ── 1. Validate: File exists ──
    if (!req.file) {
        return res.status(400).json({
            error: 'No image uploaded. Use field "boardImage".',
            code: 'NO_FILE',
        });
    }

    // ── 2. Validate: PNG only (magic bytes) ──
    if (!isPng(req.file.buffer)) {
        return res.status(415).json({
            error: 'Only PNG images are supported (magic-byte check failed).',
            code: 'BAD_TYPE',
            hint: 'Convert your image to PNG and try again.',
        });
    }

    // ── 3. Extract context from form ──
    // The service uses context to select model (gpt-4o for math, gpt-4o-mini otherwise)
    const context = {
        subject: String(req.body.subject || '').trim(),
        topic: String(req.body.topic || '').trim(),
        class: String(req.body.class || '').trim(),
    };

    // ── 4. Log request (development only) ──
    if (process.env.NODE_ENV === 'development') {
        console.log('[Controller] Recognition request:', {
            subject: context.subject || '(none)',
            topic: context.topic || '(none)',
            class: context.class || '(none)',
            fileSizeKB: (req.file.size / 1024).toFixed(1),
        });
    }

    // ── 5. Call the service (UNCHANGED) ──
    try {
        const result = await handwritingRecognitionService.recognizeHandwriting(
            req.file.buffer,
            { context }
        );

        // ── 6. Return result + demo telemetry ──
        // The service result is passed through UNCHANGED.
        // We add demo-only fields for the UI.
        const response = {
            ...result,                                    // text, provider, degraded, has_math, legible, message
            _elapsedMs: Date.now() - started,
            _fileSizeKB: +(req.file.size / 1024).toFixed(1),
            _usedContext: context,
        };

        if (process.env.NODE_ENV === 'development') {
            console.log('[Controller] Recognition complete:', {
                provider: result.provider,
                degraded: result.degraded,
                hasMath: result.has_math,
                legible: result.legible,
                textLength: result.text?.length || 0,
                elapsedMs: response._elapsedMs,
            });
        }

        return res.status(200).json(response);

    } catch (error) {
        // The service catches its own errors and returns degraded results.
        // But if something unexpected bubbles up, we catch it here.
        console.error('[Controller] Recognition failed:', error);
        return res.status(500).json({
            error: error.message || 'Recognition service failed',
            code: 'RECOGNITION_FAILED',
            _elapsedMs: Date.now() - started,
        });
    }
}

/**
 * GET /health
 * 
 * Returns circuit breaker health status from the service.
 * Useful for monitoring and debugging fallback behavior.
 */
export function health(req, res) {
    try {
        const status = handwritingRecognitionService.getHealthStatus();
        res.json({
            ...status,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Controller] Health check failed:', error);
        res.status(500).json({
            error: 'Health check failed',
            message: error.message,
        });
    }
}

/**
 * POST /reset-breaker
 * 
 * Manually resets the circuit breaker to CLOSED state.
 * Useful after fixing API keys or during demos.
 */
export function resetBreaker(req, res) {
    try {
        const result = handwritingRecognitionService.resetBreaker();
        res.json({
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Controller] Reset breaker failed:', error);
        res.status(500).json({
            error: 'Failed to reset breaker',
            message: error.message,
        });
    }
}