import { GoogleGenAI, Type } from "@google/genai";
import {
    AGENT_RESPONSE_SCHEMA,
    AGENT_TOOL_REFERENCE,
} from "./agentActions.schema.js";
import { GEMINI_MODEL, modelSupportsVision, resolveGeminiModel } from "./gemini-model.js";

/**
 * Gemini Agent Service
 * Handles AI agent interactions using Google Gemini API
 */

const MAX_SHAPES_IN_PROMPT = 200;
const MAX_SIMPLE_SHAPES = 40;
const MAX_BLURRY_SHAPES = 80;

// Hard cap on actions applied per turn. Gemini structured output can fall into a
// repetition loop (emitting the same create_shape hundreds of times until it hits
// maxOutputTokens). Match the prompt (12). 40 still looked like an infinite stack.
const MAX_ACTIONS_PER_TURN = 12;
const MAX_CREATE_SHAPES_PER_TURN = 10;
const MAX_UNLABELED_GEO_CREATES = 2;
const GEO_SHAPE_TYPES = new Set(['rectangle', 'geo', 'ellipse', 'circle', 'diamond', 'triangle']);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gemini 429 / quota / rate-limit detection (paid keys can still 429).
 * @param {unknown} err
 * @returns {boolean}
 */
export function isQuotaError(err) {
    if (!err) return false;
    const status = err.status ?? err.code;
    if (status === 429 || status === '429' || status === 'RESOURCE_EXHAUSTED') return true;
    if (err.code === 'quota') return true;
    const msg = String(err.message || err);
    return /quota|rate limit|exhausted|RESOURCE_EXHAUSTED/i.test(msg);
}

export class AgentQuotaError extends Error {
    constructor(message = 'RootDrishti hit the Gemini limit. Try again shortly.') {
        super(message);
        this.name = 'AgentQuotaError';
        this.code = 'quota';
    }
}

/**
 * Stable signature for an agent action, used to collapse repetition-loop output.
 * Two actions with the same signature are treated as duplicates.
 * @param {object} a
 * @returns {string}
 */
export function actionSignature(a) {
    if (!a || typeof a !== 'object') return '';
    const p = a.props || {};
    const bucket = (n) => {
        const num = Number(n);
        return Number.isFinite(num) ? Math.round(num / 10) : '';
    };
    const x = a.x ?? p.x;
    const y = a.y ?? p.y;
    const text = (a.text ?? p.text ?? '').toString().slice(0, 40);
    return [
        a.type || '',
        a.shapeType || '',
        a.logicalId || a.shapeId || '',
        bucket(x),
        bucket(y),
        text,
    ].join('|');
}

/**
 * Drop duplicate / ladder-loop actions and cap the total per turn.
 *
 * Exact-signature dedupe is not enough: Gemini often unique-ifies logicalId
 * and increments y, producing a tall stack of unlabeled rectangles. Real
 * flowchart nodes have distinct props.text; a y-only ladder does not.
 *
 * @param {object[]} actions
 * @returns {object[]}
 */
export function dedupeActions(actions) {
    const seen = new Set();
    const ladderCounts = new Map();
    const out = [];
    let unlabeledGeo = 0;
    let createCount = 0;

    const bucket = (n, size) => {
        const num = Number(n);
        return Number.isFinite(num) ? Math.round(num / size) : '';
    };

    for (const action of Array.isArray(actions) ? actions : []) {
        if (!action || typeof action !== 'object') continue;
        if (out.length >= MAX_ACTIONS_PER_TURN) break;
        const sig = actionSignature(action);
        if (sig && seen.has(sig)) continue;
        if (sig) seen.add(sig);

        if (action.type === 'create_shape') {
            const p = action.props && typeof action.props === 'object' ? action.props : {};
            const text = String(action.text ?? p.text ?? '').trim();
            const shapeType = String(action.shapeType || p.geo || 'rectangle').toLowerCase();
            const ladderKey = [
                shapeType,
                bucket(action.x ?? p.x, 40),
                bucket(action.w ?? p.w, 20),
                bucket(action.h ?? p.h, 20),
                text.slice(0, 40),
            ].join('|');
            const n = (ladderCounts.get(ladderKey) || 0) + 1;
            ladderCounts.set(ladderKey, n);
            if (n > 1) continue;

            if (createCount >= MAX_CREATE_SHAPES_PER_TURN) continue;

            if (GEO_SHAPE_TYPES.has(shapeType) && !text) {
                unlabeledGeo += 1;
                if (unlabeledGeo > MAX_UNLABELED_GEO_CREATES) continue;
            }
            createCount += 1;
        }

        out.push(action);
    }
    return out;
}

/**
 * Best-effort extract completed action objects from a partial JSON stream.
 * Walks the "actions" array and returns objects that fully parse.
 * @param {string} text
 * @param {number} alreadyEmitted
 * @returns {object[]}
 */
export function extractCompletedActionsFromPartial(text, alreadyEmitted = 0) {
    const src = String(text || '');
    const key = '"actions"';
    const keyIdx = src.indexOf(key);
    if (keyIdx < 0) return [];

    let i = src.indexOf('[', keyIdx + key.length);
    if (i < 0) return [];

    const completed = [];
    i += 1;
    while (i < src.length) {
        while (i < src.length && /[\s,]/.test(src[i])) i += 1;
        if (i >= src.length || src[i] === ']') break;
        if (src[i] !== '{') break;

        let depth = 0;
        let inString = false;
        let escape = false;
        const start = i;
        for (; i < src.length; i += 1) {
            const ch = src[i];
            if (inString) {
                if (escape) {
                    escape = false;
                } else if (ch === '\\') {
                    escape = true;
                } else if (ch === '"') {
                    inString = false;
                }
                continue;
            }
            if (ch === '"') {
                inString = true;
                continue;
            }
            if (ch === '{') depth += 1;
            else if (ch === '}') {
                depth -= 1;
                if (depth === 0) {
                    i += 1;
                    const slice = src.slice(start, i);
                    try {
                        completed.push(JSON.parse(slice));
                    } catch {
                        // incomplete object internals
                    }
                    break;
                }
            }
        }
        if (depth !== 0) break;
    }

    return completed.slice(alreadyEmitted);
}

/**
 * Pull a top-level "message" string from partial / broken JSON.
 * @param {string} text
 * @returns {string}
 */
export function extractPartialMessage(text) {
    const src = String(text || '');
    const msgMatch = src.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (!msgMatch) return '';
    try {
        return JSON.parse(`"${msgMatch[1]}"`);
    } catch {
        return msgMatch[1];
    }
}

/**
 * Close truncated JSON safely enough to parse, or return null.
 * Handles the common case: output cut mid-string / mid-object by max tokens.
 * @param {string} text
 * @returns {object|null}
 */
export function tryRepairTruncatedJson(text) {
    let src = String(text || '').trim();
    if (!src) return null;

    const fence = src.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) src = fence[1].trim();

    // Already valid?
    try {
        const parsed = JSON.parse(src);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch {
        // continue
    }

    // If truncated inside a string, close the string first
    let inString = false;
    let escape = false;
    for (let i = 0; i < src.length; i += 1) {
        const ch = src[i];
        if (inString) {
            if (escape) escape = false;
            else if (ch === '\\') escape = true;
            else if (ch === '"') inString = false;
        } else if (ch === '"') {
            inString = true;
        }
    }
    let repaired = src;
    if (inString) repaired += '"';

    // Drop a trailing dangling comma
    repaired = repaired.replace(/,\s*$/, '');

    // Close open braces/brackets
    const stack = [];
    inString = false;
    escape = false;
    for (let i = 0; i < repaired.length; i += 1) {
        const ch = repaired[i];
        if (inString) {
            if (escape) escape = false;
            else if (ch === '\\') escape = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') stack.push('}');
        else if (ch === '[') stack.push(']');
        else if (ch === '}' || ch === ']') stack.pop();
    }
    while (stack.length) repaired += stack.pop();

    try {
        const parsed = JSON.parse(repaired);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch {
        return null;
    }
    return null;
}

/**
 * Salvage a usable { message, actions } from broken / truncated model JSON.
 * Prefers full parse → repair → incremental action extraction.
 * @param {string} responseText
 * @returns {{ message: string, actions: object[], salvaged: boolean }}
 */
export function salvageAgentResponse(responseText) {
    const text = String(responseText || '').trim();
    if (!text) {
        return { message: '', actions: [], salvaged: false };
    }

    let jsonText = text;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonText = fence[1].trim();

    try {
        const parsed = JSON.parse(jsonText);
        return {
            message: typeof parsed.message === 'string' ? parsed.message : '',
            actions: Array.isArray(parsed.actions) ? parsed.actions : [],
            salvaged: false,
        };
    } catch {
        // fall through
    }

    const repaired = tryRepairTruncatedJson(jsonText);
    if (repaired) {
        return {
            message: typeof repaired.message === 'string' ? repaired.message : extractPartialMessage(jsonText),
            actions: Array.isArray(repaired.actions) ? repaired.actions : extractCompletedActionsFromPartial(jsonText, 0),
            salvaged: true,
        };
    }

    const actions = extractCompletedActionsFromPartial(jsonText, 0);
    const message = extractPartialMessage(jsonText);
    return {
        message: message || (actions.length ? 'Applied what I could from a partial response.' : ''),
        actions,
        salvaged: true,
    };
}

class GeminiAgentService {
    constructor() {
        // Accept the common aliases so a key copied from AI Studio works under
        // whichever name it was pasted as.
        const apiKey =
            process.env.GOOGLE_API_KEY ||
            process.env.GEMINI_API_KEY ||
            process.env.GOOGLE_GENAI_API_KEY;
        if (!apiKey) {
            throw new Error(
                "GOOGLE_API_KEY is not set in backend/.env. Get a key from https://aistudio.google.com/apikey, add GOOGLE_API_KEY=... and restart the server."
            );
        }
        this.ai = new GoogleGenAI({ apiKey });
        this.modelName = GEMINI_MODEL;
        console.log(`[RootDrishti] Initialized Gemini Agent with model: ${this.modelName}`);
    }

    buildSystemPrompt(mode = 'visual') {
        const baseInstructions = `You are RootDrishti AI, an intelligent assistant that helps teachers create educational content on a digital canvas.

You MUST respond with JSON only: { "message": string, "actions": Action[] }.

${AGENT_TOOL_REFERENCE}

### Coordinate System:
- Canvas uses (x, y). Prefer placing NEW shapes near the viewport center from the user prompt.
- Default sizes: rectangle 150x80, ellipse/circle/diamond/triangle 120x120, text auto.
- Always set logicalId on create_shape so arrows can bind in the same batch.
`;

        const modeInstructions = {
            explain: `
### EXPLAIN MODE:
- Primary job: teach. Put a clear, concise explanation in "message" (prefer under 180 words).
- actions[] should usually be [] unless a tiny label/diagram clearly helps.
- Use the screenshot + shape JSON; do not invent shapes that are not on the board.`,

            visual: `
### VISUAL MODE — EXECUTE canvas commands:
- When the user asks to draw/create/add/make a diagram or flowchart, FILL actions[] with create_shape (and arrow) entries. message alone is NOT enough.
- Diamonds = decisions, rectangles = process steps, arrows connect via startShapeId/endShapeId.
- Space shapes 160-200 units apart.`,

            mathematical: `
### MATHEMATICAL MODE — EXECUTE figure commands:
- When asked to draw axes, ellipses, parabolas, labeled points — put create_shape actions in actions[].
- Add text labels with create_shape shapeType "text" or label_shape on existing shapes.`
        };

        return baseInstructions + (modeInstructions[mode] || modeInstructions.visual);
    }

    /**
     * Prefer viewport+selection shapes when the board is large (>200).
     * Uses bounds overlap (not origin-only) so large shapes aren't dropped.
     */
    selectShapesForPrompt(canvasContext = {}) {
        const shapes = Array.isArray(canvasContext.shapes) ? canvasContext.shapes : [];
        if (shapes.length <= MAX_SHAPES_IN_PROMPT) {
            return { shapes, truncated: false, total: shapes.length };
        }

        const selected = new Set(
            (canvasContext.selectedShapes || canvasContext.selection || []).map(String)
        );
        const vp = canvasContext.viewport || {};
        const hasVp = Number.isFinite(vp.x) && Number.isFinite(vp.y)
            && Number.isFinite(vp.w) && Number.isFinite(vp.h);

        const inViewport = (s) => {
            if (!hasVp) return false;
            const sx = Number(s.x) || 0;
            const sy = Number(s.y) || 0;
            const sw = Number(s.w) || 0;
            const sh = Number(s.h) || 0;
            const maxX = sx + Math.max(sw, 1);
            const maxY = sy + Math.max(sh, 1);
            const vpMaxX = vp.x + vp.w;
            const vpMaxY = vp.y + vp.h;
            return !(maxX < vp.x || sx > vpMaxX || maxY < vp.y || sy > vpMaxY);
        };

        const prioritized = [];
        const seen = new Set();
        for (const s of shapes) {
            const id = String(s.shapeId || s.id || '');
            if (selected.has(id) || inViewport(s)) {
                prioritized.push(s);
                seen.add(id);
            }
        }
        for (const s of shapes) {
            if (prioritized.length >= MAX_SHAPES_IN_PROMPT) break;
            const id = String(s.shapeId || s.id || '');
            if (seen.has(id)) continue;
            prioritized.push(s);
            seen.add(id);
        }

        return {
            shapes: prioritized.slice(0, MAX_SHAPES_IN_PROMPT),
            truncated: true,
            total: shapes.length,
        };
    }

    /**
     * Tiered shape context: Simple (focus) → Blurry (in-view) → Peripheral clusters.
     */
    buildTieredShapeContext(canvasContext = {}) {
        const { shapes, truncated, total } = this.selectShapesForPrompt(canvasContext);
        const selected = new Set(
            (canvasContext.selectedShapes || canvasContext.selection || []).map(String)
        );
        const vp = canvasContext.viewport || {};
        const hasVp = Number.isFinite(vp.x) && Number.isFinite(vp.y)
            && Number.isFinite(vp.w) && Number.isFinite(vp.h);
        const vpMaxX = hasVp ? vp.x + vp.w : 0;
        const vpMaxY = hasVp ? vp.y + vp.h : 0;

        const overlaps = (s) => {
            if (!hasVp) return true;
            const sx = Number(s.x) || 0;
            const sy = Number(s.y) || 0;
            const sw = Number(s.w) || 0;
            const sh = Number(s.h) || 0;
            return !((sx + Math.max(sw, 1)) < vp.x || sx > vpMaxX || (sy + Math.max(sh, 1)) < vp.y || sy > vpMaxY);
        };

        const simple = [];
        const blurry = [];
        const peripheral = [];
        const inSimple = new Set();

        // Focus: selected first, then in-view until cap
        for (const s of shapes) {
            const id = String(s.shapeId || s.id || '');
            if (!selected.has(id)) continue;
            const slim = this.slimShapeForPrompt(s);
            if (!slim) continue;
            simple.push(slim);
            inSimple.add(id);
        }
        for (const s of shapes) {
            if (simple.length >= MAX_SIMPLE_SHAPES) break;
            const id = String(s.shapeId || s.id || '');
            if (inSimple.has(id) || !overlaps(s)) continue;
            const slim = this.slimShapeForPrompt(s);
            if (!slim) continue;
            simple.push(slim);
            inSimple.add(id);
        }

        for (const s of shapes) {
            const id = String(s.shapeId || s.id || '');
            if (inSimple.has(id)) continue;
            const slim = this.slimShapeForPrompt(s);
            if (!slim) continue;
            if (overlaps(s) && blurry.length < MAX_BLURRY_SHAPES) {
                blurry.push({
                    shapeId: slim.shapeId,
                    type: slim.type,
                    x: slim.x,
                    y: slim.y,
                    w: slim.w,
                    h: slim.h,
                    text: slim.text ? String(slim.text).slice(0, 40) : '',
                });
            } else {
                peripheral.push(slim);
            }
        }

        let peripheralSummary = null;
        if (peripheral.length > 0) {
            const xs = peripheral.map((s) => Number(s.x) || 0);
            const ys = peripheral.map((s) => Number(s.y) || 0);
            peripheralSummary = {
                count: peripheral.length,
                approxBounds: {
                    x: Math.round(Math.min(...xs)),
                    y: Math.round(Math.min(...ys)),
                    maxX: Math.round(Math.max(...xs)),
                    maxY: Math.round(Math.max(...ys)),
                },
                note: `${peripheral.length} shapes outside the focus area`,
            };
        }

        return {
            simple,
            blurry,
            peripheralSummary,
            truncated,
            total,
        };
    }

    /**
     * Drop huge stroke payloads before sending to Gemini — they burn tokens
     * and rarely help the model follow draw/label commands.
     */
    slimShapeForPrompt(shape) {
        if (!shape || typeof shape !== 'object') return shape;
        const round = (n) => {
            const num = Number(n);
            return Number.isFinite(num) ? Math.round(num * 10) / 10 : 0;
        };
        const slim = {
            shapeId: shape.shapeId,
            type: shape.type,
            x: round(shape.x),
            y: round(shape.y),
            w: round(shape.w),
            h: round(shape.h),
            color: shape.color,
            text: typeof shape.text === 'string' ? shape.text.slice(0, 120) : '',
        };
        if (shape.geo) slim.geo = shape.geo;
        if (shape.type === 'arrow') {
            slim.start = shape.start;
            slim.end = shape.end;
        }
        if (shape.type === 'draw') slim.note = 'handwritten_stroke';
        if (shape.type === 'image') slim.note = 'embedded_image';
        return slim;
    }

    buildUserPrompt(userMessage, canvasContext = {}, contextItems = [], imageContextItems = [], extras = {}) {
        const { viewport = {}, selectedShapes = [] } = canvasContext;
        const tiers = this.buildTieredShapeContext(canvasContext);

        const cx = Number.isFinite(viewport.x) && Number.isFinite(viewport.w)
            ? Math.round(viewport.x + viewport.w / 2)
            : 400;
        const cy = Number.isFinite(viewport.y) && Number.isFinite(viewport.h)
            ? Math.round(viewport.y + viewport.h / 2)
            : 300;

        let prompt = `User request: ${userMessage}\n\n`;
        prompt += `Viewport center for new shapes: (${cx}, ${cy})\n`;

        const chatHistory = Array.isArray(extras.chatHistory) ? extras.chatHistory : [];
        if (chatHistory.length > 0) {
            prompt += `\n--- RECENT CHAT ---\n`;
            for (const turn of chatHistory.slice(-8)) {
                const role = turn.role === 'assistant' ? 'Assistant' : 'Teacher';
                const content = String(turn.content || '').slice(0, 400);
                prompt += `${role}: ${content}\n`;
            }
            prompt += `-------------------\n\n`;
        }

        const userActions = Array.isArray(extras.userActionHistory) ? extras.userActionHistory : [];
        if (userActions.length > 0) {
            prompt += `--- RECENT TEACHER CANVAS ACTIONS ---\n`;
            prompt += `${JSON.stringify(userActions.slice(-20))}\n`;
            prompt += `Use these to resolve pronouns like "that" / "those".\n\n`;
        }

        if (canvasContext.screenshotDataUrl) {
            prompt += `A screenshot of the current viewport is attached — use it with the shape JSON.\n\n`;
        }

        if (imageContextItems.length > 0) {
            prompt += `--- VISUAL CONTEXT (IMAGES) ---\n`;
            prompt += `The user has provided ${imageContextItems.length} image(s) as visual context.\n\n`;
        }

        if (contextItems.length > 0) {
            prompt += `--- CONTEXT PROVIDED BY USER ---\n`;
            contextItems.forEach((item, idx) => {
                if (item.type === 'shape') {
                    prompt += `[Context ${idx + 1}: Shape]\n${JSON.stringify(this.slimShapeForPrompt(item.shape))}\n\n`;
                } else if (item.type === 'canvas') {
                    prompt += `[Context ${idx + 1}: Full Canvas - ${item.shapes?.length || 0} shapes]\n\n`;
                } else if (item.type === 'page') {
                    prompt += `[Context ${idx + 1}: Visible page - ${item.shapes?.length || 0} shapes]\n\n`;
                }
            });
            prompt += `-------------------------------\n\n`;
        }

        if (viewport.x !== undefined) {
            prompt += `Current viewport: ${JSON.stringify(viewport)}\n`;
        }

        prompt += `Selected shape IDs: ${JSON.stringify(selectedShapes)}\n`;

        if (tiers.simple.length > 0 || tiers.blurry.length > 0 || tiers.peripheralSummary) {
            prompt += tiers.truncated
                ? `Canvas context (tiered; board has ${tiers.total} shapes):\n`
                : `Canvas context (tiered):\n`;
            prompt += `Focus shapes (full props): ${JSON.stringify(tiers.simple)}\n`;
            if (tiers.blurry.length > 0) {
                prompt += `In-view blurry shapes: ${JSON.stringify(tiers.blurry)}\n`;
            }
            if (tiers.peripheralSummary) {
                prompt += `Peripheral: ${JSON.stringify(tiers.peripheralSummary)}\n`;
            }
            prompt += `\n`;
        } else {
            prompt += `Canvas shapes: []\n\n`;
        }

        prompt += `Respond with JSON { message, actions } only. If the user asked for a canvas change, actions must not be empty.\n`;
        return prompt;
    }

    buildContents(systemPrompt, userPrompt, canvasContext = {}, imageContextItems = []) {
        const parts = [];

        if (canvasContext?.screenshotDataUrl) {
            const match = String(canvasContext.screenshotDataUrl).match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                parts.push({ inlineData: { mimeType: match[1] || 'image/jpeg', data: match[2] } });
            }
        }

        for (const img of imageContextItems || []) {
            if (!img?.dataUrl) continue;
            const base64Match = String(img.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
            if (base64Match) {
                parts.push({ inlineData: { mimeType: base64Match[1], data: base64Match[2] } });
            }
        }

        parts.push({ text: `${systemPrompt}\n\n${userPrompt}` });
        return [{ role: 'user', parts }];
    }

    /**
     * Structured JSON config. Keep thinking off / minimal so classroom draw
     * turns stay fast on Gemini 3.x Flash.
     * Visual diagrams need more room — big flowcharts truncate below 12288.
     */
    getStructuredConfig(mode = 'visual') {
        const maxOutputTokens = mode === 'explain' ? 4096 : 12288;
        const model = resolveGeminiModel({ mode });
        const config = {
            responseMimeType: 'application/json',
            responseSchema: AGENT_RESPONSE_SCHEMA,
            // Very low temperature (<=0.3) makes Gemini structured output prone to
            // repetition loops. 0.55 keeps draw turns deterministic enough while
            // avoiding the "same shape 100×" degeneration.
            temperature: mode === 'explain' ? 0.2 : 0.55,
            maxOutputTokens,
        };

        // Gemini 3.x prefers thinkingLevel; 2.5 used thinkingBudget.
        if (/gemini-3/i.test(model)) {
            config.thinkingConfig = { thinkingLevel: 'minimal' };
        } else {
            config.thinkingConfig = { thinkingBudget: 0 };
        }

        return config;
    }

    async * streamAgentResponse(
        userMessage,
        canvasContext = {},
        mode = 'visual',
        contextItems = [],
        imageContextItems = [],
        extras = {}
    ) {
        yield { type: 'status', text: 'Working…' };
        try {
            const parsed = await this.generateResponse(
                userMessage,
                canvasContext,
                mode,
                contextItems,
                imageContextItems,
                extras
            );
            yield { type: 'complete', content: '', parsed };
        } catch (error) {
            console.error('[RootDrishti] Gemini API error:', error);
            if (isQuotaError(error)) {
                yield {
                    type: 'error',
                    error: 'quota',
                    detail: error.message || 'RootDrishti hit the Gemini limit. Try again shortly.',
                };
                return;
            }
            yield { type: 'error', error: error.message || 'Failed to generate response' };
        }
    }

    /**
     * Parse structured JSON from Gemini. Salvages truncated output when needed.
     */
    parseAgentResponse(responseText) {
        const text = String(responseText || '').trim();
        if (!text) {
            throw new Error('Empty model response');
        }

        const result = salvageAgentResponse(text);
        if (result.actions.length > 0 || result.message) {
            const actions = dedupeActions(result.actions);
            if (result.actions.length > actions.length) {
                console.warn(
                    `[RootDrishti] collapsed ${result.actions.length - actions.length} looped actions, kept ${actions.length}`
                );
            }
            return {
                message: result.message,
                actions,
            };
        }

        // Valid empty payload is fine; unsalvageable garbage is not
        if (!result.salvaged) {
            return { message: '', actions: [] };
        }
        throw new Error('Failed to parse model JSON');
    }

    async generateResponse(
        userMessage,
        canvasContext = {},
        mode = 'visual',
        contextItems = [],
        imageContextItems = [],
        extras = {}
    ) {
        const systemPrompt = this.buildSystemPrompt(mode);
        const userPrompt = this.buildUserPrompt(
            userMessage,
            canvasContext,
            contextItems,
            imageContextItems,
            extras
        );
        const modelName = resolveGeminiModel({ mode, modelName: extras.modelName });
        const contents = this.buildContents(systemPrompt, userPrompt, canvasContext, imageContextItems);
        const config = this.getStructuredConfig(mode);

        const once = async () => {
            const response = await this.ai.models.generateContent({
                model: modelName,
                contents,
                config,
            });
            return this.parseAgentResponse(response.text || '');
        };

        try {
            return await once();
        } catch (error) {
            if (isQuotaError(error)) {
                console.warn('[RootDrishti] Gemini quota/429 — retrying once in 2s');
                await sleep(2000);
                try {
                    return await once();
                } catch (retryErr) {
                    console.error('[RootDrishti] Gemini API error:', retryErr);
                    if (isQuotaError(retryErr)) {
                        throw new AgentQuotaError();
                    }
                    throw new Error('Failed to generate response: ' + retryErr.message);
                }
            }
            console.error('[RootDrishti] Gemini API error:', error);
            throw new Error('Failed to generate response: ' + error.message);
        }
    }

    async generateTopicSuggestions(topicName, subtopicName) {
        const prompt = `You are an educational AI assistant helping teachers create visual content on a digital canvas.

Topic: ${topicName}
Subtopic: ${subtopicName}

Generate 5 creative and educational drawing suggestions that a teacher could use to explain this subtopic visually.`;

        const fallback = [
            `Draw a diagram explaining ${subtopicName}`,
            `Create a flowchart for ${subtopicName}`,
            `Illustrate key concepts of ${subtopicName}`,
            `Add labeled shapes showing ${subtopicName}`,
            `Draw a visual representation of ${subtopicName}`,
        ];

        try {
            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents: prompt,
                config: {
                    temperature: 0.8,
                    maxOutputTokens: 1024,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                },
            });

            const suggestions = JSON.parse(response.text || '[]');
            if (Array.isArray(suggestions) && suggestions.length > 0) {
                return suggestions;
            }
            return fallback;
        } catch (error) {
            console.error('[RootDrishti] Error generating topic suggestions:', error);
            return fallback.slice(0, 3);
        }
    }

      
    /**
 * Generate text from an image using Gemini Vision
 * 
 * This method is designed for handwriting recognition and OCR tasks.
 * It accepts a PNG image buffer and returns transcribed text.
 * 
 * ── PHASE 2: Added detail parameter support ──
 * ── PHASE 3: Improved LaTeX handling ──
 * 
 * @param {Buffer} imageBuffer - PNG image buffer
 * @param {string} prompt - The prompt to send (should include LaTeX rules)
 * @param {Object} options - Additional options
 * @param {number} options.temperature - Temperature (default: 0.1 for OCR)
 * @param {number} options.maxTokens - Max tokens (default: 4096)
 * @param {string} options.model - Model name (default: this.modelName)
 * @param {string} options.responseFormat - 'json' or 'text' (default: 'json')
 * @param {string} options.systemPrompt - Optional system prompt
 * @param {string} options.detail - Image detail: 'auto' | 'high' | 'low' (default: 'auto')
 * @returns {Promise<string>} - The response text (JSON string)
 */
async generateFromImage(imageBuffer, prompt, options = {}) {
    const {
        temperature = 0.1,  // ← Lower for OCR determinism
        maxTokens = 4096,
        model = this.modelName,
        responseFormat = 'json',
        systemPrompt = null,
        detail = 'auto',  // ← PHASE 2: New parameter
    } = options;

    // ── 1. Validate inputs ──
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
        throw new Error('Image buffer is required');
    }

    if (imageBuffer.length === 0) {
        throw new Error('Image buffer is empty');
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        throw new Error('Prompt is required');
    }

    // ── 2. Check if model supports vision ──
    if (!modelSupportsVision(model)) {
        console.warn(`[Gemini] Model "${model}" may not support vision. Use ${GEMINI_MODEL} (or another Gemini flash/pro) for vision tasks.`);
    }

    // ── 3. Convert buffer to base64 ──
    const base64Image = imageBuffer.toString('base64');
    const mimeType = 'image/png';

    // ── 4. Build prompt with system instruction if provided ──
    let finalPrompt = prompt;
    if (systemPrompt) {
        finalPrompt = `${systemPrompt}\n\n${prompt}`;
    }

    // ── 5. Build content parts ──
    const parts = [
        { text: finalPrompt },
        {
            inlineData: {
                mimeType,
                data: base64Image,
            },
        },
    ];

    // ── 6. Build contents array ──
    const contents = [
        {
            role: 'user',
            parts,
        },
    ];

    // ── 7. Log request (development only) ──
    if (process.env.NODE_ENV === 'development') {
        console.log('[Gemini] Vision request:', {
            model,
            temperature,
            maxTokens,
            responseFormat,
            detail,  // ← PHASE 2: Log detail
            imageSize: `${(imageBuffer.length / 1024).toFixed(1)}KB`,
            promptLength: finalPrompt.length,
        });
    }

    // ── 8. Make API call ──
    try {
        const startTime = Date.now();

        const response = await this.ai.models.generateContent({
            model,
            contents,
            config: {
                temperature,
                maxOutputTokens: maxTokens,
            },
        });

        const elapsed = Date.now() - startTime;
        const result = response.text || '';

        // ── 9. Handle response format ──
        let finalResult = result;

        if (responseFormat === 'json') {
            const trimmed = result.trim();
            
            try {
                // Try to parse as JSON
                const parsed = JSON.parse(trimmed);
                finalResult = JSON.stringify(parsed);
            } catch {
                // If it's plain text, wrap it properly
                // Remove any markdown or extra formatting
                const cleanText = trimmed
                    .replace(/^```json\s*/i, '')
                    .replace(/^```\s*/i, '')
                    .replace(/```\s*$/i, '')
                    .trim();
                
                // ── PHASE 3: Check if it looks like math ──
                const looksLikeMath = /\\[a-zA-Z]+|[_^{}]|√|∑|∫|∂|π|±|≤|≥|≠|→|∞|∇|∏|∈|∉|∀|∃/.test(cleanText);
                
                // Wrap in standard format with has_math detection
                const wrapped = {
                    text: cleanText,
                    provider: 'gemini',
                    confidence: 0.85,
                    has_math: looksLikeMath,  // ← PHASE 3: Add has_math flag
                    legible: cleanText.length > 0,
                };
                finalResult = JSON.stringify(wrapped);
            }
        }

        if (process.env.NODE_ENV === 'development') {
            console.log(`[Gemini] Vision response in ${elapsed}ms:`, {
                resultLength: finalResult.length,
                detail,  // ← PHASE 2: Log detail used
                resultPreview: finalResult.substring(0, 100) + (finalResult.length > 100 ? '...' : ''),
            });
        } else {
            console.log(`[Gemini] Vision completed in ${elapsed}ms, ${finalResult.length} chars (detail: ${detail})`);
        }

        return finalResult;

    } catch (error) {
        console.error('[Gemini] Vision API error:', {
            message: error.message,
            status: error.status,
            code: error.code,
        });

        // ── 10. Enhance error messages ──
        if (error.message?.includes('API key not valid') || 
            error.message?.includes('permission') ||
            error.message?.includes('authentication')) {
            throw new Error('Google API key is invalid or expired. Please check your configuration.');
        }

        if (error.message?.includes('rate limit') || 
            error.message?.includes('quota') ||
            error.message?.includes('exhausted')) {
            throw new Error('Gemini rate limit exceeded. Please try again later.');
        }

        if (error.message?.includes('blocked') || 
            error.message?.includes('safety')) {
            throw new Error('Content was blocked by Gemini safety filters. Please try a different image.');
        }

        if (error.message?.includes('timeout') || 
            error.message?.includes('deadline')) {
            throw new Error('Gemini request timed out. Please try again.');
        }

        if (error.message?.includes('too large') || 
            error.message?.includes('size')) {
            throw new Error('Image is too large for Gemini. Please reduce the size and try again.');
        }

        throw new Error(`Gemini vision request failed: ${error.message}`);
    }
 }

   async generateContentWithJson(prompt, options = {}) {
        const {
            temperature = 0.7,
            maxTokens = 4096,
        } = options;

        // 1. Validate inputs 
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            throw new Error('Prompt is required for JSON generation');
        }

        //  2. Build enhanced prompt with explicit JSON instruction 
        const jsonPrompt = `${prompt}\n\nReturn ONLY valid JSON. No markdown, no code fences, no extra text.`;

        //  3. Log request (development only) 
        if (process.env.NODE_ENV === 'development') {
            console.log('[Gemini] JSON generation request:', {
                model: this.modelName,
                temperature,
                maxTokens,
                promptLength: jsonPrompt.length,
            });
        }

        // 4. Make API call 
        try {
            const startTime = Date.now();

            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents: jsonPrompt,
                config: {
                    temperature,
                    maxOutputTokens: maxTokens,
                    responseMimeType: 'application/json',
                },
            });

            const elapsed = Date.now() - startTime;
            let result = (response.text || '').trim();
            result = result.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

            try {
                const parsed = JSON.parse(result);
                const validatedResult = JSON.stringify(parsed);
                console.log(`[Gemini] JSON generation completed in ${elapsed}ms, ${validatedResult.length} chars`);
                return validatedResult;
            } catch (parseError) {
                console.error('[Gemini] JSON validation failed:', parseError.message);
                throw new Error(`Gemini returned invalid JSON: ${parseError.message}`);
            }

        } catch (error) {
            console.error('[Gemini] JSON generation error:', {
                message: error.message,
                status: error.status,
                code: error.code,
            });

            //  8. Enhance error messages for common cases 
            if (error.message?.includes('API key not valid') || 
                error.message?.includes('permission') ||
                error.message?.includes('authentication')) {
                throw new Error('Google API key is invalid or expired. Please check your configuration.');
            }

            if (error.message?.includes('rate limit') || 
                error.message?.includes('quota') ||
                error.message?.includes('exhausted')) {
                throw new Error('Gemini rate limit exceeded. Please try again later.');
            }

            if (error.message?.includes('blocked') || 
                error.message?.includes('safety')) {
                throw new Error('Content was blocked by Gemini safety filters. Please modify the prompt and try again.');
            }

            if (error.message?.includes('timeout') || 
                error.message?.includes('deadline')) {
                throw new Error('Gemini request timed out. Please try again.');
            }

            if (error.message?.includes('too large') || 
                error.message?.includes('size')) {
                throw new Error('Prompt is too large for Gemini. Please reduce the size and try again.');
            }

            // Re-throw with original message for other errors
            throw new Error(`Gemini JSON generation failed: ${error.message}`);
        }
    }
}

// Lazy singleton — only created on first use, after dotenv has loaded env vars
let _instance = null;

export const geminiAgentService = new Proxy({}, {
    get(_, prop) {
        if (!_instance) {
            _instance = new GeminiAgentService();
        }
        const value = _instance[prop];
        return typeof value === 'function' ? value.bind(_instance) : value;
    }
});
