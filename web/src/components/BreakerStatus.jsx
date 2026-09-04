/**
 * Breaker Status Component
 * 
 * Displays circuit breaker health and statistics.
 * Shows state with color coding:
 * - CLOSED (green): Normal operation
 * - OPEN (red): OpenAI is bypassed, using Gemini
 * - HALF-OPEN (orange): Testing recovery
 */

export default function BreakerStatus({ health, onRefresh, loading }) {
    if (!health) {
        return (
            <div style={{
                marginTop: 16,
                padding: '12px 16px',
                border: '1px solid #eee',
                borderRadius: 8,
                backgroundColor: '#f8f9fa',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <span style={{ color: '#999' }}>Click "Check Breaker" to see status</span>
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    style={{
                        padding: '4px 12px',
                        borderRadius: 4,
                        border: '1px solid #007bff',
                        backgroundColor: '#fff',
                        color: '#007bff',
                        cursor: 'pointer',
                    }}
                >
                    {loading ? '...' : 'Check Breaker'}
                </button>
            </div>
        );
    }

    const breaker = health.breaker || {};
    const state = breaker.state || 'UNKNOWN';
    
    const stateColors = {
        'CLOSED': { bg: '#d4edda', color: '#155724', text: ' CLOSED (normal)' },
        'OPEN': { bg: '#f8d7da', color: '#721c24', text: ' OPEN (using Gemini fallback)' },
        'HALF-OPEN': { bg: '#fff3cd', color: '#856404', text: ' HALF-OPEN (testing recovery)' },
        'UNKNOWN': { bg: '#e2e3e5', color: '#383d41', text: ' UNKNOWN' },
    };

    const style = stateColors[state] || stateColors['UNKNOWN'];

    return (
        <div style={{
            marginTop: 16,
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                backgroundColor: style.bg,
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
            }}>
                <div>
                    <span style={{ fontWeight: 600, color: style.color }}>
                        Circuit Breaker
                    </span>
                    <span style={{
                        marginLeft: 12,
                        fontWeight: 500,
                        color: style.color,
                    }}>
                        {style.text}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={onRefresh}
                        disabled={loading}
                        style={{
                            padding: '4px 12px',
                            borderRadius: 4,
                            border: '1px solid #6c757d',
                            backgroundColor: '#fff',
                            color: '#6c757d',
                            cursor: 'pointer',
                            fontSize: '0.85em',
                        }}
                    >
                        {loading ? '...' : '↻ Refresh'}
                    </button>
                    <button
                        onClick={async () => {
                            try {
                                const { resetBreaker } = await import('../api.js');
                                await resetBreaker();
                                onRefresh();
                            } catch (e) {
                                alert('Failed to reset: ' + e.message);
                            }
                        }}
                        style={{
                            padding: '4px 12px',
                            borderRadius: 4,
                            border: '1px solid #28a745',
                            backgroundColor: '#28a745',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.85em',
                        }}
                    >
                         Reset Breaker
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '8px',
                backgroundColor: '#fafafa',
            }}>
                <Stat label="Failures" value={breaker.failures || 0} />
                <Stat label="Successes" value={breaker.successes || 0} />
                <Stat label="Rejects" value={breaker.rejects || 0} />
                <Stat label="Fallbacks" value={breaker.fallbacks || 0} />
                <Stat label="Pending" value={breaker.pending || 0} />
            </div>

            {/* Raw JSON (for debugging) */}
            <details style={{ padding: '0 16px 12px', fontSize: '0.75em' }}>
                <summary style={{ cursor: 'pointer', color: '#888', padding: '4px 0' }}>
                    Show raw status
                </summary>
                <pre style={{
                    backgroundColor: '#f8f9fa',
                    padding: '8px',
                    borderRadius: 4,
                    overflow: 'auto',
                    maxHeight: '200px',
                    fontSize: '0.9em',
                    margin: '4px 0 0 0',
                }}>
                    {JSON.stringify(health, null, 2)}
                </pre>
            </details>
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7em', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {label}
            </div>
            <div style={{ fontSize: '1.2em', fontWeight: 600, color: '#333' }}>
                {value}
            </div>
        </div>
    );
}