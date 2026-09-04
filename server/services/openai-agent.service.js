
/**
 * OpenAI helpers used by Assessment board-shape flow (and related agent work).
 *
 * Important: canvas/agent prompts (buildSystemPrompt) tell the model to emit
 * shape *actions*. Quiz generation must NOT use that system prompt — it would
 * return create_shape actions instead of quiz JSON.
 * Always call generateJsonCompletion() for Assessment quizzes.
 */
import OpenAI from 'openai'


class OpenAIAgentService {
    constructor() {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not set in environment variables')
        }
        this.openai = new OpenAI({ apiKey })
        this.modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini'
        console.log('Initialized OpenAI Agent with model:', this.modelName)
    }

    /** System prompt for drawing on the canvas — NOT for quiz JSON. */
    buildSystemPrompt(mode = 'visual') {
        const baseInstructions = `You are RootDrishti AI, an intelligent assistant that helps teachers create educational content on a digital canvas.

### Common Actions:
1. CREATE SHAPES: Draw geometric shapes (rectangle, circle, diamond, ellipse, arrow, text)
2. ADD TEXT: Add text labels and annotations
3. UPDATE SHAPES: Modify existing shapes (color, size, position)
4. DELETE SHAPES: Remove shapes from the canvas

### Coordinate System:
- The canvas uses a standard (x, y) system.
- Space shapes appropriately based on context (150-200 units apart for flowcharts).
- Standard shape size: 150x80 for rectangles, 120x120 for circles/diamonds.
- CRITICAL: Use "logicalId" (e.g., "step1", "start") for every shape you create.

### Response Format (JSON ONLY):
{
    "message": "Your response to the user",
    "actions": [
        {
            "type": "create_shape",
            "logicalId": "string (required)",
            "shapeType": "rectangle|circle|diamond|ellipse|text|arrow|axes|curve",
            "props": {
                "x": number,
                "y": number,
                "w": number,
                "h": number,
                "color": "black|blue|green|red|orange|violet",
                "text": "text content",
                "geo": "rectangle|diamond|ellipse|circle",
                "startShapeId": "logicalId (for arrows)",
                "endShapeId": "logicalId (for arrows)"
            }
        }
    ],
    "thinking": "Your reasoning process"
}`

        const modeInstructions = {
            explain: `
### EXPLAIN MODE - Plain Text Explanation Only:
Your ONLY task is to provide a clear, well-structured written explanation.
- Do NOT return JSON.
- Do NOT create or suggest any canvas shapes.
- Write ONLY a rich, readable text explanation in markdown.`,

            visual: `
### VISUAL MODE - Focus on Diagrams and Flowcharts:
- Create well-structured flowcharts and diagrams.
- Use diamonds for decisions, rectangles for processes.
- Connect shapes with arrows using startShapeId and endShapeId.
- Space shapes 150-200 units apart.`,

            mathematical: `
### MATHEMATICAL MODE - Focus on Mathematical Figures:
- Draw accurate mathematical figures (ellipses, parabolas, etc.).
- Create coordinate systems with axes when needed.
- Add mathematical annotations and labels.`
        }

        return baseInstructions + (modeInstructions[mode] || modeInstructions.visual)
    }

    
    buildUserPrompt(userMessage, canvasContext = {}, contextItems = [], imageContextItems = []) {
        const { shapes = [], viewport = {}, selectedShapes = [] } = canvasContext
        let prompt = `User request: ${userMessage}\n\n`

        if (imageContextItems.length > 0) {
            prompt += `--- VISUAL CONTEXT (IMAGES) ---\n`
            prompt += `The user has provided ${imageContextItems.length} image(s) as visual context.\n\n`
        }

        if (contextItems.length > 0) {
            prompt += `--- CONTEXT PROVIDED BY USER ---\n`
            contextItems.forEach((item, idx) => {
                if (item.type === 'shape') {
                    prompt += `[Context ${idx + 1}: Shape]\n${JSON.stringify(item.shape, null, 2)}\n\n`
                } else if (item.type === 'canvas') {
                    prompt += `[Context ${idx + 1}: Full Canvas - ${item.shapes?.length || 0} shapes]\n\n`
                }
            })
            prompt += `-------------------------------\n\n`
        }

        if (viewport.x !== undefined) {
            prompt += `Current viewport: x=${viewport.x}, y=${viewport.y}, width=${viewport.w}, height=${viewport.h}\n\n`
        }

        if (shapes.length > 0) {
            prompt += `Current canvas shapes (${shapes.length} total):\n`
            shapes.slice(0, 20).forEach((shape, idx) => {
                prompt += `${idx + 1}. ${shape.type} at (${Math.round(shape.x)}, ${Math.round(shape.y)})`
                if (shape.text) prompt += `, text: "${shape.text}"`
                prompt += '\n'
            })
            prompt += '\n'
        }

        return prompt
    }

    
    buildMessages(systemPrompt, userPrompt, imageContextItems = []) {
        const messages = [
            { role: 'system', content: systemPrompt }
        ]

        // Handle images if present and using a vision-capable model
        if (imageContextItems.length > 0 && this.modelName.includes('gpt-4o')) {
            // Build vision-compatible user message
            const content = [
                { type: 'text', text: userPrompt }
            ]

            for (const img of imageContextItems) {
                if (img.dataUrl) {
                    // Extract base64 data from data URL
                    const base64Match = img.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
                    if (base64Match) {
                        content.push({
                            type: 'image_url',
                            image_url: {
                                url: `data:${base64Match[1]};base64,${base64Match[2]}`
                            }
                        })
                    }
                }
            }

            messages.push({ role: 'user', content })
        } else {
            // Standard text-only message
            messages.push({ role: 'user', content: userPrompt })
        }

        return messages
    }

    
    async * streamAgentResponse(userMessage, canvasContext = {}, mode = 'visual', contextItems = [], imageContextItems = []) {
        const systemPrompt = this.buildSystemPrompt(mode)
        const userPrompt = this.buildUserPrompt(userMessage, canvasContext, contextItems, imageContextItems)

        try {
            const messages = this.buildMessages(systemPrompt, userPrompt, imageContextItems)

            const stream = await this.openai.chat.completions.create({
                model: this.modelName,
                messages: messages,
                temperature: 0.7,
                max_tokens: 8192,
                stream: true
            })

            let fullResponse = ''
            let responseBuffer = ''

            for await (const chunk of stream) {
                const chunkText = chunk.choices[0]?.delta?.content || ''
                fullResponse += chunkText
                responseBuffer += chunkText

                // Yield chunk for streaming display
                yield { type: 'chunk', content: chunkText, fullResponse }
            }

            // Parse and yield complete response
            try {
                const parsedResponse = this.parseAgentResponse(fullResponse)
                yield { type: 'complete', content: fullResponse, parsed: parsedResponse }
            } catch {
                yield { type: 'complete', content: fullResponse, parsed: { message: fullResponse, actions: [] } }
            }

            yield { type: 'done' }

        } catch (error) {
            console.error('OpenAI API error:', error)
            yield { type: 'error', error: error.message || 'Failed to generate response' }
        }
    }

    
    parseAgentResponse(responseText) {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0])
            } catch (e) {
                // If JSON parse fails, return raw text
            }
        }
        return { message: responseText, actions: [] }
    }

    async generateResponse(userMessage, canvasContext = {}, mode = 'visual', contextItems = []) {
        const systemPrompt = this.buildSystemPrompt(mode)
        const userPrompt = this.buildUserPrompt(userMessage, canvasContext, contextItems)

        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]

            const completion = await this.openai.chat.completions.create({
                model: this.modelName,
                messages: messages,
                temperature: 0.7,
                max_tokens: 8192,
                response_format: { type: 'json_object' }
            })

            const rawText = completion.choices[0]?.message?.content || ''
            return this.parseAgentResponse(rawText)

        } catch (error) {
            console.error('OpenAI API error:', error)
            throw new Error('Failed to generate response: ' + error.message)
        }
    }

    /**
     * Free-form JSON completion for assessment / quiz prompts.
     * Does NOT use the canvas RootDrishti system prompt (message/actions schema).
     *
     * @param {string} userPrompt
     * @param {{ temperature?: number, maxTokens?: number, systemPrompt?: string }} [options]
    /**
     * Assessment / structured-JSON calls — does NOT use buildSystemPrompt().
     * @returns {Promise<{ rawText: string, parsed: object|null }>}
     */
    async generateJsonCompletion(userPrompt, options = {}) {
        const {
            temperature = 0.7,
            maxTokens = 4096,
            systemPrompt = 'You are an expert educational assessment assistant. Return valid JSON only. No markdown fences.',
        } = options

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature,
                max_tokens: maxTokens,
                response_format: { type: 'json_object' },
            })

            const rawText = completion.choices[0]?.message?.content || ''
            let parsed = null
            try {
                parsed = JSON.parse(rawText)
            } catch {
                const match = rawText.match(/\{[\s\S]*\}/)
                if (match) {
                    try {
                        parsed = JSON.parse(match[0])
                    } catch {
                        parsed = null
                    }
                }
            }

            return { rawText, parsed }
        } catch (error) {
            console.error('OpenAI JSON completion error:', error)
            throw error
        }
    }

    async generateTopicSuggestions(topicName, subtopicName) {
        const prompt = `You are an educational AI assistant helping teachers create visual content on a digital canvas.

Topic: ${topicName}
Subtopic: ${subtopicName}

Generate 5 creative and educational drawing suggestions that a teacher could use to explain this subtopic visually.
Return ONLY valid JSON in this exact object shape (not a bare array):
{"suggestions": ["Draw a free body diagram", "Create a flowchart", "..."]}`

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.modelName,
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8,
                max_tokens: 4096,
                response_format: { type: 'json_object' }
            })

            const responseText = completion.choices[0]?.message?.content || ''

            try {
                const parsed = JSON.parse(responseText)
                const suggestions = Array.isArray(parsed?.suggestions)
                    ? parsed.suggestions
                    : Array.isArray(parsed)
                        ? parsed
                        : null
                if (Array.isArray(suggestions) && suggestions.length > 0) {
                    return suggestions.map(String).filter(Boolean).slice(0, 5)
                }
            } catch (parseError) {
                console.error('[OpenAI] Failed to parse suggestions JSON:', parseError.message)
                console.error('[OpenAI] Raw response:', responseText)
            }

            // Fallback: try extracting a bare array if the model ignored the wrapper
            const jsonMatch = responseText.match(/\[[\s\S]*\]/)
            if (jsonMatch) {
                try {
                    const suggestions = JSON.parse(jsonMatch[0])
                    if (Array.isArray(suggestions) && suggestions.length > 0) {
                        return suggestions.map(String).filter(Boolean).slice(0, 5)
                    }
                } catch (parseError) {
                    console.error('[OpenAI] Failed to parse suggestions array:', parseError.message)
                }
            } else {
                console.warn('[OpenAI] No suggestions found in response:', responseText)
            }

            // Fallback suggestions
            return [
                `Draw a diagram explaining ${subtopicName}`,
                `Create a flowchart for ${subtopicName}`,
                `Illustrate key concepts of ${subtopicName}`,
                `Add labeled shapes showing ${subtopicName}`,
                `Draw a visual representation of ${subtopicName}`
            ]

        } catch (error) {
            console.error('Error generating topic suggestions:', error)
            return [
                `Draw a diagram explaining ${subtopicName}`,
                `Create a flowchart for ${subtopicName}`,
                `Illustrate key concepts of ${subtopicName}`
            ]
        }
    }

    // ──────────────────────────────────────────────────────────────
// UPDATE: generateFromImage - Add detail parameter
// ──────────────────────────────────────────────────────────────

/**
 * Generate text from an image using OpenAI Vision
 * 
 * ── PHASE 2: Added detail parameter ──
 * 
 * @param {Buffer} imageBuffer - PNG image buffer
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Additional options
 * @param {number} options.temperature - Temperature (default: 0.3)
 * @param {number} options.maxTokens - Max tokens (default: 4096)
 * @param {string} options.model - Model name (default: this.modelName)
 * @param {string} options.responseFormat - 'json' or 'text' (default: 'json')
 * @param {string} options.systemPrompt - Optional system prompt
 * @param {string} options.detail - Image detail: 'auto' | 'high' | 'low' (default: 'auto')
 * @returns {Promise<string>} - The response text
 */
async generateFromImage(imageBuffer, prompt, options = {}) {
    const {
        temperature = 0.3,
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
    const visionModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision-preview'];
    const supportsVision = visionModels.some(m => model.includes(m));
    
    if (!supportsVision) {
        console.warn(`[OpenAI] Model "${model}" may not support vision. Use gpt-4o-mini for vision tasks.`);
    }

    // ── 3. Convert buffer to base64 data URL ──
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    // ── 4. Build messages ──
    const messages = [];

    if (systemPrompt) {
        messages.push({
            role: 'system',
            content: systemPrompt,
        });
    }

    // ── 5. PHASE 2: Pass detail to image_url ──
    const content = [
        { type: 'text', text: prompt },
        {
            type: 'image_url',
            image_url: {
                url: dataUrl,
                detail: detail,  // ← PHASE 2: New field
            },
        },
    ];

    messages.push({
        role: 'user',
        content,
    });

    // ── 6. Prepare request options ──
    const requestOptions = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
    };

    // ── 7. Add response_format if requesting JSON ──
    if (responseFormat === 'json' && prompt.toLowerCase().includes('json')) {
        requestOptions.response_format = { type: 'json_object' };
    } else if (responseFormat === 'json') {
        console.warn('[OpenAI] Warning: response_format=json but prompt does not contain "json".');
    }

    // ── 8. Log request ──
    if (process.env.NODE_ENV === 'development') {
        console.log('[OpenAI] Vision request:', {
            model,
            temperature,
            maxTokens,
            detail,  // ← PHASE 2: Log detail
            imageSize: `${(imageBuffer.length / 1024).toFixed(1)}KB`,
            promptLength: prompt.length,
            usingResponseFormat: !!requestOptions.response_format,
        });
    }

    // ── 9. Make API call ──
    try {
        const startTime = Date.now();
        
        const completion = await this.openai.chat.completions.create(requestOptions);
        
        const elapsed = Date.now() - startTime;
        const result = completion.choices[0]?.message?.content || '';
        
        if (process.env.NODE_ENV === 'development') {
            console.log(`[OpenAI] Vision response in ${elapsed}ms:`, {
                resultLength: result.length,
                detail,  // ← PHASE 2: Log detail used
                resultPreview: result.substring(0, 100) + (result.length > 100 ? '...' : ''),
            });
        } else {
            console.log(`[OpenAI] Vision completed in ${elapsed}ms, ${result.length} chars (detail: ${detail})`);
        }
        
        return result;

    } catch (error) {
        console.error('[OpenAI] Vision API error:', {
            message: error.message,
            status: error.status,
            code: error.code,
        });

        // ── Error handling ──
        if (error.status === 401) {
            throw new Error('OpenAI API key is invalid or expired. Please check your configuration.');
        }
        if (error.status === 429) {
            throw new Error('OpenAI rate limit exceeded. Please try again later.');
        }
        if (error.status === 400) {
            if (error.message?.includes('image') || error.message?.includes('url')) {
                throw new Error('Invalid image format. Please provide a valid PNG image.');
            }
            if (error.message?.includes('context length')) {
                throw new Error('Image or prompt is too large. Please reduce the size and try again.');
            }
            if (error.message?.includes('json')) {
                console.warn('[OpenAI] Retrying without response_format due to JSON requirement...');
                delete requestOptions.response_format;
                const retryCompletion = await this.openai.chat.completions.create(requestOptions);
                const retryResult = retryCompletion.choices[0]?.message?.content || '';
                return retryResult;
            }
        }
        if (error.code === 'ECONNRESET' || error.message?.includes('timeout')) {
            throw new Error('OpenAI request timed out. Please try again.');
        }
        if (error.message?.includes('overloaded')) {
            throw new Error('OpenAI service is currently overloaded. Please try again later.');
        }

        throw new Error(`OpenAI vision request failed: ${error.message}`);
    }
  }
}

// Lazy singleton — only created on first use, after dotenv has loaded env vars
let _instance = null

export const openaiAgentService = new Proxy({}, {
    get(_, prop) {
        if (!_instance) {
            _instance = new OpenAIAgentService()
        }
        const value = _instance[prop]
        return typeof value === 'function' ? value.bind(_instance) : value
    }
})

export { OpenAIAgentService }