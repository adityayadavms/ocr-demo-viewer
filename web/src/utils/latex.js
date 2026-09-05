/**
 * LaTeX Utility Functions
 * 
 * Shared utilities for rendering LaTeX in the OCR Demo Viewer.
 * 
 * ── What this does ──
 * 1. Preprocesses text (fixes common OCR errors)
 * 2. Renders mixed content (prose + math) with KaTeX
 * 3. Escapes HTML for safety
 * 4. Handles chemistry notation (C₆H₆, H₂O, etc.)
 */

import katex from 'katex';

/**
 * HTML-escape a string for safe rendering
 * 
 * ── Why ──
 * Prevents XSS attacks when rendering user-provided text.
 * 
 * @param {string} str - String to escape
 * @returns {string} - HTML-escaped string
 */
export function escapeHtml(str) {
    if (!str) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return str.replace(/[&<>"']/g, function(m) { return map[m]; });
}

/**
 * Preprocess chemistry formulas
 * 
 * ── Why ──
 * OCR often mistakes 'O' for '0' (zero) and misplaces subscripts.
 * 
 * Examples:
 * - "0_2" → "O_2" (oxygen gas)
 * - "H_20" → "H_2O" (water)
 * - "CO2" → "CO_2" (carbon dioxide)
 * 
 * @param {string} text - Raw text from OCR
 * @returns {string} - Fixed chemistry notation
 */
export function preprocessChemistry(text) {
    if (!text) return '';
    
    return text
        // ── Fix zero vs O (common OCR error) ──
        // "C6H60" → "C6H6O" (oxygen)
        .replace(/([A-Za-z])0([^a-zA-Z])/g, '$1O$2')
        .replace(/([A-Za-z])0([A-Za-z])/g, '$1O$2')
        
        // ── Fix water ──
        // "H_20" → "H_2O" 
        .replace(/H_20/g, 'H_2O')
        .replace(/H20(?![_^])/g, 'H_2O')
        
        // ── Fix common compounds ──
        .replace(/CO2(?![_^])/g, 'CO_2')
        .replace(/SO4(?![_^])/g, 'SO_4')
        .replace(/O2(?![_^])/g, 'O_2')
        .replace(/H2(?![_^])/g, 'H_2')
        .replace(/N2(?![_^])/g, 'N_2')
        .replace(/Cl2(?![_^])/g, 'Cl_2')
        
        // ── Fix subscript order ──
        // "C6H6" → "C_6H_6" (but only if it's chemistry)
        .replace(/([A-Z][a-z]?)(\d+)([A-Z])/g, '$1_$2$3')
        .replace(/([A-Z][a-z]?)(\d+)$/g, '$1_$2');
}

/**
 * Preprocess math formulas
 * 
 * ── Why ──
 * OCR often outputs plain text versions of math symbols.
 * 
 * Examples:
 * - "->" → "\rightarrow"
 * - "sqrt{x}" → "\sqrt{x}"
 * - "sin(x)" → "\sin(x)"
 * 
 * @param {string} text - Raw text from OCR
 * @returns {string} - Fixed math notation
 */
export function preprocessMath(text) {
    if (!text) return '';
    
    return text
        // ── Fix arrows ──
        .replace(/->/g, '\\rightarrow ')
        .replace(/=>/g, '\\Rightarrow ')
        .replace(/<-/g, '\\leftarrow ')
        .replace(/<=/g, '\\Leftarrow ')
        
        // ── Fix square roots ──
        .replace(/sqrt\{([^}]+)\}/g, '\\sqrt{$1}')
        .replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}')
        .replace(/sqrt([^{\(])/g, '\\sqrt{$1}')
        
        // ── Fix fractions ──
        .replace(/frac\{([^}]+)\}\{([^}]+)\}/g, '\\frac{$1}{$2}')
        .replace(/frac\(([^)]+)\)\(([^)]+)\)/g, '\\frac{$1}{$2}')
        
        // ── Fix trigonometric functions ──
        .replace(/sin\s*\(/g, '\\sin(')
        .replace(/cos\s*\(/g, '\\cos(')
        .replace(/tan\s*\(/g, '\\tan(')
        .replace(/csc\s*\(/g, '\\csc(')
        .replace(/sec\s*\(/g, '\\sec(')
        .replace(/cot\s*\(/g, '\\cot(')
        
        // ── Fix Greek letters ──
        .replace(/alpha/g, '\\alpha')
        .replace(/beta/g, '\\beta')
        .replace(/gamma/g, '\\gamma')
        .replace(/delta/g, '\\delta')
        .replace(/theta/g, '\\theta')
        .replace(/pi(?![a-zA-Z])/g, '\\pi')
        .replace(/omega/g, '\\omega')
        .replace(/sigma/g, '\\sigma')
        .replace(/tau/g, '\\tau')
        
        // ── Fix subscripts and superscripts ──
        .replace(/([a-zA-Z])(\d+)(?![_^])/g, '$1_{$2}')
        .replace(/\^(\d+)/g, '^{$1}')
        .replace(/\^([a-zA-Z])/g, '^{$1}');
}

/**
 * Preprocess text based on context
 * 
 * ── Why ──
 * Different subjects need different preprocessing rules.
 * 
 * @param {string} text - Raw text from OCR
 * @param {Object} context - { subject, has_math, topic }
 * @returns {string} - Preprocessed text
 */
export function preprocessText(text, context = {}) {
    if (!text) return '';
    
    let processed = text;
    
    // ── Subject-specific preprocessing ──
    const subject = context.subject || '';
    const hasMath = context.has_math || false;
    
    if (subject === 'Chemistry' || subject === 'Chem') {
        processed = preprocessChemistry(processed);
    }
    
    if (hasMath || subject === 'Mathematics' || subject === 'Maths' || 
        subject === 'Physics' || subject === 'Statistics') {
        processed = preprocessMath(processed);
    }
    
    // ── General fixes ──
    processed = processed
        // Fix multiple spaces
        .replace(/\s+/g, ' ')
        // Fix escaped characters
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        // Remove stray backslashes before non-commands
        .replace(/\\([^a-zA-Z])/g, '$1')
        // Fix common OCR errors
        .replace(/0/g, '0') // Keep zeros that are actually zeros
        .trim();
    
    return processed;
}

/**
 * Render mixed content (prose + math) to HTML
 * 
 * ── What this does ──
 * 1. Normalizes alternate delimiters to $...$
 * 2. If no delimiters found → whole string is math
 * 3. If delimiters found → split on $...$, render math with KaTeX
 * 
 * ── The Fix ──
 * Previously, bare LaTeX with no $ delimiters was treated as prose.
 * Now, if no delimiters are found, we render the whole string as math.
 * 
 * @param {string} text - Text with LaTeX in $...$ delimiters
 * @param {boolean} displayMode - Display mode (centered, larger)
 * @returns {string} - HTML string with rendered math
 */
export function renderMixedContent(text, displayMode = false) {
    if (!text) return '';
    
    // ── KaTeX options ──
    const opts = {
        throwOnError: false,
        displayMode: displayMode,
        trust: false,
        macros: {
            "\\R": "\\mathbb{R}",
            "\\N": "\\mathbb{N}",
            "\\Z": "\\mathbb{Z}",
            "\\Q": "\\mathbb{Q}",
        }
    };
    
    // ── Step 1: Normalize alternate delimiters to $...$ ──
    let s = text
        .replace(/\\\[([\s\S]+?)\\\]/g, '$$$1$$')
        .replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$')
        .replace(/\$\$([\s\S]+?)\$\$/g, '$$$1$$')
        .replace(/\\\[([\s\S]*?)\\\]/g, '$$$1$$')
        .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
    
    // ── Step 2: No delimiters found → render whole string as math ──
    if (!s.includes('$')) {
        try {
            const result = katex.renderToString(s, opts);
            // Check if it's just escaped text (KaTeX returns HTML with error styling)
            if (result.includes('color: #e03131')) {
                return escapeHtml(s);
            }
            return result;
        } catch (error) {
            console.warn('[latex] KaTeX render failed:', error.message);
            return escapeHtml(s);
        }
    }
    
    // ── Step 3: Split on $...$ and render each part ──
    const parts = s.split(/(\$[^$]+\$)/g);
    let html = '';
    
    for (const part of parts) {
        if (!part) continue;
        
        // ── Check if this part is a math expression ──
        if (part.startsWith('$') && part.endsWith('$')) {
            const latex = part.slice(1, -1);
            try {
                html += katex.renderToString(latex, opts);
            } catch (error) {
                console.warn('[latex] KaTeX render failed:', error.message);
                html += `<span style="color: #e03131; font-family: monospace;">${escapeHtml(latex)}</span>`;
            }
        } else {
            // ── Prose: HTML-escape for safety ──
            html += escapeHtml(part);
        }
    }
    
    return html;
}

/**
 * Check if text contains math symbols
 * 
 * @param {string} text - Text to check
 * @returns {boolean} - True if text contains math symbols
 */
export function containsMath(text) {
    if (!text) return false;
    return /\\[a-zA-Z]+|[_^{}]|√|∑|∫|∂|π|±|≤|≥|≠|→|∞|∇|∏|∈|∉|∀|∃/.test(text);
}