/**
 * LaTeX Renderer Component
 * 
 * Renders text with LaTeX math using KaTeX.
 * 
 * ── Features ──
 * 1. Auto-detects math delimiters ($...$, \[...\], \(...\))
 * 2. Renders mixed content (prose + math)
 * 3. Falls back to plain text if KaTeX fails
 * 4. Supports inline and display math
 * 5. Handles bare LaTeX (no delimiters) as math
 * 6. Preprocesses chemistry and math formulas
 * 7. Toggle between raw and rendered view
 * 
 * ── Props ──
 * @param {string} text - The text to render (may contain LaTeX)
 * @param {number} fontSize - Font size in pixels (default: 16)
 * @param {string} className - Additional CSS classes
 * @param {boolean} displayMode - Display mode (centered, larger)
 * @param {string} fallbackText - Text to show if rendering fails
 * @param {boolean} renderInline - Inline vs block rendering
 * @param {Object} context - { subject, has_math, topic }
 * @param {boolean} showRaw - Show raw LaTeX instead of rendered
 * @param {boolean} showToggle - Show raw/rendered toggle button
 * 
 * ── Usage ──
 * <LatexRenderer 
 *   text="$C_6H_6 + \frac{15}{2}0_2 \rightarrow 6CO_2 + 3H_20$"
 *   fontSize={20}
 *   context={{ subject: 'Chemistry', has_math: true }}
 * />
 */

import { useState, useMemo } from 'react';
import 'katex/dist/katex.min.css';
import { 
    renderMixedContent, 
    preprocessText, 
    escapeHtml,
    containsMath,
} from '../utils/latex';

export function LatexRenderer({ 
    text, 
    fontSize = 16, 
    className = '',
    displayMode = false,
    fallbackText = '',
    renderInline = true,
    context = {},
    showRaw: initialShowRaw = false,
    showToggle = false,
}) {
    // ── State ──
    const [showRaw, setShowRaw] = useState(initialShowRaw);
    
    // ── Preprocess text ──
    const processedText = useMemo(() => {
        if (!text) return '';
        return preprocessText(text, context);
    }, [text, context]);
    
    // ── Check if it's math ──
    const hasMath = useMemo(() => {
        return containsMath(processedText) || context.has_math;
    }, [processedText, context.has_math]);
    
    // ── Handle empty text ──
    if (!processedText || processedText.trim() === '') {
        return (
            <span style={{ 
                color: '#999', 
                fontStyle: 'italic', 
                fontSize: `${fontSize}px` 
            }}>
                (empty)
            </span>
        );
    }
    
    // ── Show raw LaTeX ──
    if (showRaw) {
        return (
            <div>
                {showToggle && (
                    <button 
                        onClick={() => setShowRaw(false)}
                        style={{
                            fontSize: '0.8em',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            background: '#fff',
                            cursor: 'pointer',
                            marginBottom: '4px',
                        }}
                    >
                        Show Rendered
                    </button>
                )}
                <pre style={{
                    fontSize: `${fontSize * 0.8}px`,
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    backgroundColor: '#f8f9fa',
                    padding: '8px',
                    borderRadius: '4px',
                    margin: 0,
                    color: '#333',
                    border: '1px solid #e9ecef',
                }}>
                    {processedText}
                </pre>
            </div>
        );
    }
    
    // ── Try rendering ──
    try {
        const renderedHtml = renderMixedContent(processedText, displayMode);
        
        // ── Check if rendering produced meaningful output ──
        const isMeaningful = renderedHtml && 
            renderedHtml !== escapeHtml(processedText) &&
            !renderedHtml.includes('color: #e03131');
        
        if (!isMeaningful) {
            // ── Fallback to plain text ──
            return (
                <div>
                    {showToggle && (
                        <button 
                            onClick={() => setShowRaw(true)}
                            style={{
                                fontSize: '0.8em',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                background: '#fff',
                                cursor: 'pointer',
                                marginBottom: '4px',
                            }}
                        >
                            Show Raw LaTeX
                        </button>
                    )}
                    <span style={{ 
                        fontSize: `${fontSize}px`,
                        fontFamily: hasMath ? 'monospace' : 'inherit',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        color: '#333',
                    }}>
                        {fallbackText || processedText}
                    </span>
                </div>
            );
        }
        
        // ── Render with KaTeX ──
        return (
            <div>
                {showToggle && (
                    <button 
                        onClick={() => setShowRaw(true)}
                        style={{
                            fontSize: '0.8em',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            background: '#fff',
                            cursor: 'pointer',
                            marginBottom: '4px',
                        }}
                    >
                        Show Raw LaTeX
                    </button>
                )}
                <span
                    className={className}
                    style={{
                        fontSize: `${fontSize}px`,
                        display: renderInline ? 'inline' : 'block',
                        lineHeight: 1.6,
                        padding: displayMode ? '8px 0' : '0',
                    }}
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
            </div>
        );
        
    } catch (error) {
        console.warn('[LatexRenderer] Render error:', error.message);
        
        // ── Fallback: show escaped text ──
        return (
            <div>
                {showToggle && (
                    <button 
                        onClick={() => setShowRaw(true)}
                        style={{
                            fontSize: '0.8em',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            background: '#fff',
                            cursor: 'pointer',
                            marginBottom: '4px',
                        }}
                    >
                        Show Raw LaTeX
                    </button>
                )}
                <span style={{ 
                    fontSize: `${fontSize}px`,
                    color: '#e03131',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                }}>
                    {fallbackText || escapeHtml(processedText)}
                </span>
            </div>
        );
    }
}