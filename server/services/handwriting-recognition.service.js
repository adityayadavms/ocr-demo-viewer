import CircuitBreaker from 'opossum';
import { openaiAgentService } from './openai-agent.service.js';
import { geminiAgentService } from './gemini-agent.service.js';

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────

const CONFIG = {
    OPENAI_TIMEOUT_MS: Number(process.env.HW_TIMEOUT_MS) || 15000,
    BREAKER_ERROR_PCT: Number(process.env.HW_BREAKER_ERROR_PCT) || 40,
    BREAKER_VOLUME: Number(process.env.HW_BREAKER_VOLUME) || 3,
    BREAKER_RESET_MS: Number(process.env.HW_BREAKER_RESET_MS) || 60000,
    MAX_IMAGE_MB: Number(process.env.HW_MAX_IMAGE_MB) || 10,
    RETRY_COUNT: Number(process.env.HW_RETRY_COUNT) || 2,
    RETRY_DELAY_MS: Number(process.env.HW_RETRY_DELAY_MS) || 1000,
    MAX_TOKENS: Number(process.env.HW_MAX_TOKENS) || 4096,
};

console.log('[Handwriting] Service initialized with config:', {
    timeout: `${CONFIG.OPENAI_TIMEOUT_MS}ms`,
    errorThreshold: `${CONFIG.BREAKER_ERROR_PCT}%`,
    volumeThreshold: CONFIG.BREAKER_VOLUME,
    resetTimeout: `${CONFIG.BREAKER_RESET_MS}ms`,
    maxImageMB: CONFIG.MAX_IMAGE_MB,
    retryCount: CONFIG.RETRY_COUNT,
});

// ──────────────────────────────────────────────────────────────
// ── PHASE 2: Math Subject Detection ──
// ──────────────────────────────────────────────────────────────

const MATH_SUBJECTS = [
    'Mathematics', 'Maths', 'Physics', 'Chemistry', 
    'Computer Science', 'Science', 'Statistics', 'Calculus',
    'Algebra', 'Geometry', 'Trigonometry', 'Biology',
    'Economics', 'Engineering', 'Logic'
];

/**
 * Pick the appropriate OpenAI model based on subject
 * 
 * @param {string} subject - The subject name
 * @returns {string} - 'gpt-4o' for math, 'gpt-4o-mini' otherwise
 * 
 * ── Why this matters ──
 * gpt-4o has significantly better visual discrimination for
 * small symbols like radical indices, subscripts, and superscripts.
 * gpt-4o-mini is faster and cheaper for plain text.
 */
function pickModel(subject) {
    if (!subject) return 'gpt-4o-mini';
    const isMath = MATH_SUBJECTS.some(s => 
        subject.toLowerCase().includes(s.toLowerCase())
    );
    return isMath ? 'gpt-4o' : 'gpt-4o-mini';
}

/**
 * Pick the appropriate image detail level based on subject
 * 
 * @param {string} subject - The subject name
 * @returns {string} - 'high' for math, 'auto' otherwise
 * 
 * ── Why this matters ──
 * 'high' detail preserves small features like the index in a
 * radical. 'auto' downsamples and can lose these details.
 * Cost: 'high' costs more, but we only use it for math.
 */
function pickDetail(subject) {
    if (!subject) return 'auto';
    const isMath = MATH_SUBJECTS.some(s => 
        subject.toLowerCase().includes(s.toLowerCase())
    );
    return isMath ? 'high' : 'auto';
}

// ──────────────────────────────────────────────────────────────
// ── PHASE 2: LaTeX-Aware Prompt Builder ──
// ──────────────────────────────────────────────────────────────

/**
 * Build a recognition prompt with LaTeX rules and context
 * 
 * @param {Object} context - { class, subject, topic }
 * @returns {string} - The complete prompt
 * 
 * ── Key Features ──
 * 1. Explicit LaTeX rules for common math notation
 * 2. Cube root rule: $\sqrt[3]{3}$ NOT $3^3$
 * 3. Context injection for disambiguation
 * 4. JSON response format with has_math flag
 */
function buildRecognitionPrompt(context = {}) {
    const { subject = '', topic = '', class: className = '' } = context;
    
    let prompt = `You are an expert handwriting recognition assistant for classroom teachers.

## Your Task
Extract and transcribe the handwritten text from the image accurately.

## CRITICAL RULES

1. **Preserve ALL symbols exactly as written**
2. **For mathematical expressions, use proper LaTeX notation**
3. **For illegible characters, make your best educated guess**
4. **If the image contains no legible text, return empty text**

## MATHEMATICAL NOTATION RULES (CRITICAL)

| What You See | Write This | NOT This |
|--------------|------------|----------|
| Square root of x | $\\sqrt{x}$ | sqrt(x) |
| Cube root of 3 | $\\sqrt[3]{3}$ | $3^3$ or $\\sqrt{3}$ |
| Fourth root of 16 | $\\sqrt[4]{16}$ | $16^4$ |
| x squared | $x^{2}$ | x^2 |
| x subscript 1 | $x_{1}$ | x_1 |
| a over b | $\\frac{a}{b}$ | a/b |
| Theta | $\\theta$ | theta |
| Omega | $\\omega$ | omega |
| Sine theta | $\\sin\\theta$ | sin(theta) |
| Cosine theta | $\\cos\\theta$ | cos(theta) |
| Tangent theta | $\\tan\\theta$ | tan(theta) |
| Arrow | $\\rightarrow$ | -> |
| For all | $\\forall$ | for all |
| There exists | $\\exists$ | exists |
| Element of | $\\in$ | in |
| Not | $\\neg$ | not |
| And | $\\wedge$ | and |
| Or | $\\vee$ | or |

**⚠️ CRITICAL: A small digit in the radical notch indicates the root index.**
- $\\sqrt[3]{3}$ = cube root of 3 (NOT $3^3$)
- $\\sqrt[4]{16}$ = fourth root of 16 (NOT $16^4$)
- $\\sqrt[n]{x}$ = nth root of x

**⚠️ Chemistry Notation:**
- Water: $H_2O$ (NOT H2O)
- Sulfate: $SO_4^{2-}$ (NOT SO4^2-)

## RESPONSE FORMAT

Return ONLY valid JSON with this structure:
{
    "text": "the transcribed text in plain text or LaTeX format",
    "has_math": true|false,
    "legible": true|false
}

## Important Notes
- If you see ANY math symbols (√, ∑, ∫, ∂, etc.), set has_math: true
- If you can read ANY part of the text, set legible: true
- If the handwriting is completely illegible, set legible: false and text: ""`;

    // ── Inject context for disambiguation ──
    if (subject || topic || className) {
        prompt += `

## CONTEXT (Use for disambiguation)
- Class/Grade: ${className || 'Unknown'}
- Subject: ${subject || 'Unknown'}
- Topic: ${topic || 'Unknown'}

Use this context to resolve ambiguous characters or words. For example:
- If the subject is Mathematics and the topic is Algebra → favor mathematical interpretations
- If the subject is Chemistry → favor chemical notation like $H_2O$, $SO_4^{2-}$
- If the subject is Physics → favor physics notation like $\\theta$, $\\omega$, $\\rightarrow$`;
    }

    return prompt;
}

// ──────────────────────────────────────────────────────────────
// ── PHASE 2: Updated Service Class ──
// ──────────────────────────────────────────────────────────────

class HandwritingRecognitionService {
    constructor() {
        // ── Circuit Breaker for OpenAI ──
        this.breaker = new CircuitBreaker(
            async (imageBuffer, prompt, options = {}) => {
                const startTime = Date.now();
                const { model = 'gpt-4o-mini', detail = 'auto' } = options;
                
                try {
                    const result = await openaiAgentService.generateFromImage(
                        imageBuffer,
                        prompt,
                        { 
                            temperature: 0.1,  // Lower for OCR determinism
                            maxTokens: CONFIG.MAX_TOKENS,
                            model: model,
                            detail: detail,  // ← PHASE 2: Pass detail
                        }
                    );
                    const elapsed = Date.now() - startTime;
                    console.log(`[Handwriting] OpenAI vision completed in ${elapsed}ms (${model}, detail: ${detail})`);
                    return result;
                } catch (error) {
                    const elapsed = Date.now() - startTime;
                    console.warn(`[Handwriting] OpenAI vision failed after ${elapsed}ms:`, error.message);
                    throw error;
                }
            },
            {
                timeout: CONFIG.OPENAI_TIMEOUT_MS,
                errorThresholdPercentage: CONFIG.BREAKER_ERROR_PCT,
                rollingCountTimeout: 30000,
                rollingCountBuckets: 6,
                volumeThreshold: CONFIG.BREAKER_VOLUME,
                resetTimeout: CONFIG.BREAKER_RESET_MS,
            }
        );

        // ── Fallback function (Gemini) ──
        this.breaker.fallback(async (imageBuffer, prompt, options = {}) => {
            console.info('[Handwriting] Circuit breaker fallback triggered → Gemini');
            
            try {
                const result = await geminiAgentService.generateFromImage(
                    imageBuffer,
                    prompt,
                    { temperature: 0.1, maxTokens: CONFIG.MAX_TOKENS }
                );
                return result || '';
            } catch (error) {
                console.error('[Handwriting] Fallback (Gemini) also failed:', error.message);
                return ''; // Return empty on complete failure
            }
        });

        // ── Breaker Event Listeners ──
        this.breaker.on('open', () => {
            console.warn('[Handwriting]  Circuit breaker OPEN - OpenAI unavailable, using Gemini fallback');
        });

        this.breaker.on('halfOpen', () => {
            console.info('[Handwriting]  Circuit breaker HALF-OPEN - testing OpenAI recovery');
        });

        this.breaker.on('close', () => {
            console.info('[Handwriting]  Circuit breaker CLOSED - OpenAI restored');
        });

        this.breaker.on('fallback', () => {
            console.info('[Handwriting]  Fallback used (Gemini) - OpenAI request failed or breaker open');
        });

        this.breaker.on('reject', () => {
            console.warn('[Handwriting]  Request rejected - Circuit breaker is OPEN');
        });

        this.breaker.on('success', () => {
            if (process.env.NODE_ENV === 'development') {
                console.debug('[Handwriting]  OpenAI request succeeded');
            }
        });

        this.breaker.on('failure', (error) => {
            console.warn('[Handwriting]  OpenAI request failed:', error.message);
            if (error.status) {
                console.warn(`[Handwriting]    Status: ${error.status}`);
            }
        });

        console.log('[Handwriting] Circuit breaker initialized with threshold:', {
            errorThreshold: `${CONFIG.BREAKER_ERROR_PCT}%`,
            volumeThreshold: CONFIG.BREAKER_VOLUME,
            resetTimeout: `${CONFIG.BREAKER_RESET_MS}ms`,
            timeout: `${CONFIG.OPENAI_TIMEOUT_MS}ms`,
        });
    }

    /**
     * ── PHASE 2: Updated recognizeHandwriting ──
     * Now accepts context, picks model/detail, and builds improved prompt
     */
    async recognizeHandwriting(imageBuffer, options = {}) {
        const {
            retryCount = CONFIG.RETRY_COUNT,
            retryDelay = CONFIG.RETRY_DELAY_MS,
            onProgress = null,
            context = {},  // ← PHASE 2: New context parameter
        } = options;

        const startTime = Date.now();

        try {
            // ── 1. Validate inputs ──
            this._validateInput(imageBuffer);

            // ── 2. PHASE 2: Select model and detail based on subject ──
            const model = pickModel(context.subject);
            const detail = pickDetail(context.subject);

            // ── 3. PHASE 2: Build prompt with context ──
            const prompt = buildRecognitionPrompt(context);

            console.log('[Handwriting] Starting recognition with:', {
                model,
                detail,
                subject: context.subject,
                topic: context.topic,
                class: context.class,
            });

            this._reportProgress(onProgress, 0.1);

            // ── 4. PHASE 2: Pass model and detail to breaker ──
            const openaiResult = await this._tryOpenAI(
                imageBuffer,
                prompt,  // ← New prompt
                retryCount,
                retryDelay,
                onProgress,
                { model, detail }  // ← New options
            );

            // If OpenAI returned a result, return it
            if (openaiResult) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                console.log(`[Handwriting] Recognition completed in ${elapsed}s`, {
                    provider: openaiResult.provider,
                    degraded: openaiResult.degraded,
                    textLength: openaiResult.text?.length || 0,
                    hasMath: openaiResult.has_math,
                });
                return openaiResult;
            }

            // ── 5. Fallback to Gemini ──
            console.log('[Handwriting] OpenAI failed, trying Gemini fallback');
            this._reportProgress(onProgress, 0.7);

            const geminiResult = await this._tryGemini(imageBuffer, prompt, onProgress);

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[Handwriting] Recognition completed in ${elapsed}s (fallback)`, {
                provider: geminiResult.provider,
                degraded: geminiResult.degraded,
                textLength: geminiResult.text?.length || 0,
                hasMath: geminiResult.has_math,
            });
            this._reportProgress(onProgress, 1);
            return geminiResult;

        } catch (error) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.error(`[Handwriting] Unhandled error after ${elapsed}s:`, error.message);
            this._reportProgress(onProgress, 1);
            
            return {
                text: '',
                provider: null,
                degraded: true,
                has_math: false,
                legible: false,
                message: `Unexpected error: ${error.message}`,
            };
        }
    }

    /**
     * Try OpenAI with retry logic
     * 
     * ── PHASE 2: Updated to accept model and detail options ──
     */
    async _tryOpenAI(imageBuffer, prompt, retryCount, retryDelay, onProgress, options = {}) {
        const { model = 'gpt-4o-mini', detail = 'auto' } = options;
        let lastError = null;

        for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
                const progressBase = 0.1;
                const progressRange = 0.5;
                const progress = progressBase + (attempt / (retryCount + 1)) * progressRange;
                this._reportProgress(onProgress, Math.min(progress, 0.6));

                if (attempt > 0) {
                    console.log(`[Handwriting] Retry attempt ${attempt}/${retryCount}`);
                }

                // ── PHASE 2: Pass model and detail to breaker ──
                const text = await this.breaker.fire(imageBuffer, prompt, { model, detail });
                const trimmedText = (text || '').trim();
                
                // ── Parse JSON response ──
                let finalText = trimmedText;
                let hasMath = false;
                let legible = true;

                try {
                    const parsed = JSON.parse(trimmedText);
                    if (parsed && typeof parsed === 'object') {
                        if (typeof parsed.text === 'string') {
                            finalText = parsed.text.trim();
                        }
                        if (typeof parsed.has_math === 'boolean') {
                            hasMath = parsed.has_math;
                        }
                        if (typeof parsed.legible === 'boolean') {
                            legible = parsed.legible;
                        }
                    }
                } catch {
                    // If not JSON, use the original text
                    finalText = trimmedText;
                    // Check if it might contain math
                    hasMath = /[$\\]/.test(finalText) || /[√∑∫∂]/.test(finalText);
                }

                // ── THE FIX: Hardern has_math detection ──
                // Even if the model didn't set has_math, check if the text contains math symbols
                const looksMath = /\\[a-zA-Z]+|[_^{}]|√|∑|∫|∂|π|±|≤|≥|≠|→|∞|∇|∏|∈|∉|∀|∃/.test(finalText);
                hasMath = hasMath || looksMath;

                console.log(`[Handwriting] OpenAI returned ${finalText.length} characters`, {
                    hasMath,
                    legible,
                    looksMath,
                });

                if (!finalText) {
                    console.log('[Handwriting] OpenAI returned empty text (illegible handwriting)');
                    return {
                        text: '',
                        provider: 'openai',
                        degraded: false,
                        has_math: false,
                        legible: false,
                        message: 'No text recognized (illegible handwriting)',
                    };
                }

                console.log(`[Handwriting] OpenAI returned ${finalText.length} characters`, {
                    hasMath,
                    legible,
                });
                return {
                    text: finalText,
                    provider: 'openai',
                    degraded: false,
                    has_math: hasMath,
                    legible: legible,
                    message: 'Successfully recognized text',
                };

            } catch (error) {
                lastError = error;
                console.warn(`[Handwriting] OpenAI attempt ${attempt + 1} failed:`, error.message);

                const isTransient = this._isTransientError(error);
                const shouldRetry = isTransient && attempt < retryCount;

                if (shouldRetry) {
                    const backoff = retryDelay * Math.pow(2, attempt);
                    const jitter = Math.random() * 200;
                    const waitTime = backoff + jitter;
                    console.log(`[Handwriting] Retrying in ${Math.round(waitTime)}ms (transient error)`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    console.log('[Handwriting] OpenAI failed with non-transient error or max retries reached');
                    break;
                }
            }
        }

        console.warn('[Handwriting] All OpenAI attempts failed:', lastError?.message);
        return null;
    }

    /**
     * Fallback to Gemini
     * 
     * ── PHASE 2: Updated to use improved prompt ──
     */
    async _tryGemini(imageBuffer, prompt, onProgress) {
        this._reportProgress(onProgress, 0.8);

        try {
            console.log('[Handwriting] Trying Gemini vision...');
            const text = await geminiAgentService.generateFromImage(
                imageBuffer,
                prompt,  // ← PHASE 2: Use improved prompt
                { temperature: 0.1, maxTokens: 4095 }
            );

            const trimmedText = (text || '').trim();
            this._reportProgress(onProgress, 0.95);

           // ── Parse response ──
            let finalText = trimmedText;
            let hasMath = false;
            let legible = true;

            try {
                const parsed = JSON.parse(trimmedText);
                if (parsed && typeof parsed === 'object') {
                    if (typeof parsed.text === 'string') {
                        finalText = parsed.text.trim();
                    }
                    if (typeof parsed.has_math === 'boolean') {
                        hasMath = parsed.has_math;
                    }
                    if (typeof parsed.legible === 'boolean') {
                        legible = parsed.legible;
                    }
                }
            } catch {
                finalText = trimmedText;
                hasMath = /[$\\]/.test(finalText) || /[√∑∫∂]/.test(finalText);
            }

            // ──Harden has_math detection ──
            const looksMath = /\\[a-zA-Z]+|[_^{}]|√|∑|∫|∂|π|±|≤|≥|≠|→|∞|∇|∏|∈|∉|∀|∃/.test(finalText);
            hasMath = hasMath || looksMath;

            if (!finalText) {
                console.log('[Handwriting] Gemini also returned empty text');
                return {
                    text: '',
                    provider: null,
                    degraded: true,
                    has_math: false,
                    legible: false,
                    message: 'No text recognized by either provider (illegible handwriting)',
                };
            }

            if (!finalText) {
                console.log('[Handwriting] Gemini also returned empty text');
                return {
                    text: '',
                    provider: null,
                    degraded: true,
                    has_math: false,
                    legible: false,
                    message: 'No text recognized by either provider (illegible handwriting)',
                };
            }

            console.log(`[Handwriting] Gemini returned ${finalText.length} characters`);
            return {
                text: finalText,
                provider: 'gemini',
                degraded: true,
                has_math: hasMath,
                legible: legible,
                message: 'OpenAI failed, Gemini fallback succeeded',
            };

        } catch (error) {
            console.error('[Handwriting] Gemini fallback also failed:', error.message);
            return {
                text: '',
                provider: null,
                degraded: true,
                has_math: false,
                legible: false,
                message: 'Both OpenAI and Gemini failed',
            };
        }
    }

    // ── Helper methods ──

    _validateInput(imageBuffer) {
        if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
            throw new Error('Image buffer is required');
        }
        if (imageBuffer.length === 0) {
            throw new Error('Image buffer is empty');
        }
        const maxSize = CONFIG.MAX_IMAGE_MB * 1024 * 1024;
        if (imageBuffer.length > maxSize) {
            throw new Error(`Image size exceeds ${CONFIG.MAX_IMAGE_MB}MB limit`);
        }
        if (imageBuffer.length < 100) {
            throw new Error('Image buffer is too small (corrupted or empty)');
        }
        console.log(`[Handwriting] Image validated: ${(imageBuffer.length / 1024).toFixed(1)}KB`);
    }

    _isTransientError(error) {
        const message = (error.message || String(error)).toLowerCase();
        const status = error.status || error.statusCode || 0;

        const networkPatterns = [
            'timeout', 'etimedout', 'econnreset', 'socket', 'network',
            'econnrefused', 'enotfound', 'eai_again', 'ehostunreach',
        ];
        if (networkPatterns.some(pattern => message.includes(pattern))) {
            return true;
        }

        if (status === 429 || message.includes('rate limit') || message.includes('ratelimit')) {
            return true;
        }

        if (status >= 500 && status < 600) {
            return true;
        }

        if (message.includes('overloaded') || 
            message.includes('capacity') || 
            message.includes('internal server error') ||
            message.includes('service unavailable')) {
            return true;
        }

        if (message.includes('try again') || 
            message.includes('temporarily unavailable')) {
            return true;
        }

        return false;
    }

    _reportProgress(onProgress, value) {
        if (typeof onProgress === 'function') {
            try {
                onProgress(Math.min(Math.max(value, 0), 1));
            } catch (error) {
                // Ignore progress callback errors
            }
        }
    }

    getBreakerStatus() {
        const state = this.breaker.state || 'UNKNOWN';
        const isOpen = this.breaker.open || false;
        const isHalfOpen = this.breaker.halfOpen || false;
        const isClosed = this.breaker.closed || false;
        const pending = this.breaker.pending || 0;

        return {
            state,
            open: isOpen,
            halfOpen: isHalfOpen,
            closed: isClosed,
            pending,
            stats: {
                errorThresholdPercentage: this.breaker.errorThresholdPercentage,
                volumeThreshold: this.breaker.volumeThreshold,
                resetTimeout: this.breaker.resetTimeout,
                timeout: this.breaker.timeout,
            },
            failures: this.breaker.stats?.failures || 0,
            successes: this.breaker.stats?.successes || 0,
            rejects: this.breaker.stats?.rejects || 0,
            fallbacks: this.breaker.stats?.fallbacks || 0,
            status: isOpen ? 'OPEN (skipping OpenAI)' : 
                    isHalfOpen ? 'HALF-OPEN (testing recovery)' : 
                    isClosed ? 'CLOSED (normal)' : 'UNKNOWN',
        };
    }

    resetBreaker() {
        try {
            this.breaker.close();
            console.info('[Handwriting] Circuit breaker manually reset to CLOSED');
            return { success: true, message: 'Circuit breaker reset successfully' };
        } catch (error) {
            console.error('[Handwriting] Failed to reset breaker:', error.message);
            return { success: false, message: error.message };
        }
    }

    getHealthStatus() {
        const breakerStatus = this.getBreakerStatus();
        const config = {
            timeout: CONFIG.OPENAI_TIMEOUT_MS,
            errorThreshold: CONFIG.BREAKER_ERROR_PCT,
            volumeThreshold: CONFIG.BREAKER_VOLUME,
            resetTimeout: CONFIG.BREAKER_RESET_MS,
            maxImageMB: CONFIG.MAX_IMAGE_MB,
            retryCount: CONFIG.RETRY_COUNT,
        };

        return {
            healthy: breakerStatus.closed || breakerStatus.halfOpen,
            breaker: breakerStatus,
            config,
            timestamp: new Date().toISOString(),
        };
    }
}

// ── Lazy Singleton ──
let _instance = null;

export const handwritingRecognitionService = new Proxy({}, {
    get(_, prop) {
        if (!_instance) {
            _instance = new HandwritingRecognitionService();
        }
        const value = _instance[prop];
        return typeof value === 'function' ? value.bind(_instance) : value;
    }
});

export default handwritingRecognitionService;