/**
 * Shared Gemini model id for RootDrishti and other AI surfaces.
 * Override with GEMINI_MODEL in backend/.env.
 *
 * Default is gemini-3.5-flash. A paid Google API key uses the same default —
 * swap GOOGLE_API_KEY only. Override GEMINI_MODEL after ListModels if needed.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

/** Stronger model for explain / hard reasoning (override with GEMINI_REASONING_MODEL). */
export const GEMINI_REASONING_MODEL =
    process.env.GEMINI_REASONING_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash';

/** Current Flash ids known to accept image inputs (plus any name containing "gemini"). */
export const GEMINI_VISION_MODELS = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
];

/**
 * Whether a model name is expected to support multimodal/vision input.
 * @param {string} model
 * @returns {boolean}
 */
export function modelSupportsVision(model) {
    const m = String(model || '');
    if (m.includes('gemini')) return true;
    return GEMINI_VISION_MODELS.some((known) => m.includes(known));
}

/**
 * Pick a model for this request. Explicit override wins; explain prefers reasoning model.
 * @param {{ mode?: string, modelName?: string }} opts
 * @returns {string}
 */
export function resolveGeminiModel(opts = {}) {
    if (opts.modelName && typeof opts.modelName === 'string') return opts.modelName;
    if (opts.mode === 'explain') return GEMINI_REASONING_MODEL;
    return GEMINI_MODEL;
}
