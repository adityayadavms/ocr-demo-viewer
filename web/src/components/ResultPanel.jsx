/**
 * Result Panel Component
 * 
 * Displays all fields returned by the recognition service:
 * - text (recognized content)
 * - provider (openai | gemini | null)
 * - degraded (boolean)
 * - has_math (boolean)
 * - legible (boolean)
 * - message (status)
 * - _elapsedMs (timing)
 * - _fileSizeKB (size)
 * - _usedContext (context used)
 */

function Badge({ color, text, bgColor = null }) {
    const style = {
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: '0.75em',
        fontWeight: 600,
        marginRight: 6,
        marginBottom: 4,
        color: color || '#fff',
        backgroundColor: bgColor || color || '#666',
        letterSpacing: '0.3px',
    };
    return <span style={style}>{text}</span>;
}

function ProviderBadge({ provider, degraded }) {
    if (provider === 'openai') {
        return <Badge bgColor="#2e7d32" text="openai" />;
    }
    if (provider === 'gemini') {
        return <Badge bgColor="#b8860b" text="gemini" />;
    }
    return <Badge bgColor="#777" text="none" />;
}

export default function ResultPanel({ result, truth }) {
    if (!result) {
        return (
            <div style={{
                marginTop: 16,
                padding: 20,
                border: '1px solid #eee',
                borderRadius: 8,
                textAlign: 'center',
                color: '#999',
            }}>
                No results yet — upload an image and click "Recognize"
            </div>
        );
    }

    const illegible = !result.text?.trim();
    const exactMatch = truth?.trim() && result.text?.trim() === truth.trim();

    return (
        <div style={{ marginTop: 16, border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
            {/* Header / Badges */}
            <div style={{
                padding: '12px 16px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                alignItems: 'center',
            }}>
                <ProviderBadge provider={result.provider} degraded={result.degraded} />
                
                {result.degraded && (
                    <Badge bgColor="#c0392b" text="⚠ degraded (fallback)" />
                )}
                
                {result.has_math && (
                    <Badge bgColor="#6a1b9a" text="math" />
                )}
                
                {!result.legible && (
                    <Badge bgColor="#555" text="illegible" />
                )}
                
                {result._elapsedMs != null && (
                    <Badge bgColor="#333" text={`${result._elapsedMs}ms`} />
                )}
                
                {result._fileSizeKB != null && (
                    <Badge bgColor="#555" text={`${result._fileSizeKB}KB`} />
                )}
            </div>

            {/* Body */}
            <div style={{ padding: '16px' }}>
                {/* Recognized Text */}
                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.9em', color: '#333' }}>
                        Recognized Text
                    </div>
                    <pre style={{
                        backgroundColor: illegible ? '#f8f8f8' : '#f0f4f8',
                        padding: '12px',
                        borderRadius: 4,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: 0,
                        fontFamily: 'monospace',
                        fontSize: '0.95em',
                        minHeight: '60px',
                        color: illegible ? '#999' : '#222',
                        border: illegible ? '1px dashed #ccc' : '1px solid #e0e0e0',
                    }}>
                        {illegible ? '(empty → illegible)' : result.text}
                    </pre>
                </div>

                {/* Status Message */}
                {result.message && (
                    <div style={{
                        color: '#666',
                        fontSize: '0.9em',
                        padding: '8px 12px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: 4,
                        marginBottom: 12,
                    }}>
                        <i>{result.message}</i>
                    </div>
                )}

                {/* Context Used */}
                {result._usedContext && (
                    <div style={{
                        fontSize: '0.8em',
                        color: '#888',
                        backgroundColor: '#f8f9fa',
                        padding: '8px 12px',
                        borderRadius: 4,
                        marginBottom: 12,
                    }}>
                        <strong>Context:</strong>{' '}
                        {Object.entries(result._usedContext)
                            .filter(([_, v]) => v)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' • ') || '(none)'}
                    </div>
                )}

                {/* Ground Truth Comparison */}
                {truth && truth.trim() && (
                    <div style={{
                        borderTop: '1px solid #eee',
                        paddingTop: 12,
                        marginTop: 8,
                    }}>
                        <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.9em', color: '#333' }}>
                            Ground Truth
                        </div>
                        <pre style={{
                            backgroundColor: '#eef7ee',
                            padding: '12px',
                            borderRadius: 4,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            margin: 0,
                            fontFamily: 'monospace',
                            fontSize: '0.95em',
                            border: '1px solid #c8e6c9',
                        }}>
                            {truth}
                        </pre>
                        <div style={{ marginTop: 8, fontSize: '0.9em' }}>
                            <span style={{ fontWeight: 500 }}>Match:</span>{' '}
                            {exactMatch ? (
                                <span style={{ color: '#2e7d32' }}>Exact match</span>
                            ) : (
                                <span style={{ color: '#c0392b' }}> Differs</span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}