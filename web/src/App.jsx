import { useState, useMemo, useCallback } from 'react';
import { recognize, getHealth } from './api';
import Uploader from './components/Uploader';
import ContextForm from './components/ContextForm';
import ResultPanel from './components/ResultPanel';
import BreakerStatus from './components/BreakerStatus';

function App() {
    // ── State ──
    const [file, setFile] = useState(null);
    const [context, setContext] = useState({
        subject: '',
        topic: '',
        className: '',
    });
    const [truth, setTruth] = useState('');
    const [result, setResult] = useState(null);
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(false);
    const [healthLoading, setHealthLoading] = useState(false);
    const [error, setError] = useState('');
    
    // ── Validation state ──
    const [touched, setTouched] = useState({
        subject: false,
        topic: false,
        className: false,
    });
    
    // ── Computed ──
    const preview = useMemo(() => {
        if (!file) return null;
        return URL.createObjectURL(file);
    }, [file]);

    // ── Validation functions ──
    const validateField = useCallback((field, value) => {
        if (!value || value.trim() === '') {
            return `${field.charAt(0).toUpperCase() + field.slice(1)} is required`;
        }
        return '';
    }, []);

    const validateAll = useCallback(() => {
        const errors = {
            subject: validateField('subject', context.subject),
            topic: validateField('topic', context.topic),
            className: validateField('class', context.className),
        };
        
        // Mark all as touched
        setTouched({
            subject: true,
            topic: true,
            className: true,
        });
        
        return errors;
    }, [context, validateField]);

    const isFormValid = useCallback(() => {
        return (
            context.subject.trim() !== '' &&
            context.topic.trim() !== '' &&
            context.className.trim() !== ''
        );
    }, [context]);

    // ── Handlers ──
    const handleContextChange = (patch) => {
        setContext((prev) => ({ ...prev, ...patch }));
        
        // Mark field as touched when user interacts
        Object.keys(patch).forEach((key) => {
            if (!touched[key]) {
                setTouched((prev) => ({ ...prev, [key]: true }));
            }
        });
    };

    const handleRecognize = async () => {
        // ── Validate all fields ──
        const errors = validateAll();
        const hasErrors = Object.values(errors).some((err) => err !== '');
        
        if (hasErrors) {
            setError('Please fill in all required fields');
            // Scroll to the first error
            const firstErrorField = Object.keys(errors).find((key) => errors[key] !== '');
            if (firstErrorField) {
                const element = document.querySelector(`[name="${firstErrorField}"]`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.focus();
                }
            }
            return;
        }
        
        if (!file) {
            setError('Please select an image first');
            return;
        }

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const data = await recognize({
                file,
                subject: context.subject,
                topic: context.topic,
                className: context.className,
            });
            setResult(data);
        } catch (err) {
            setError(err.message || 'Recognition failed');
            console.error('[App] Recognition error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCheckHealth = async () => {
        setHealthLoading(true);
        try {
            const data = await getHealth();
            setHealth(data);
        } catch (err) {
            console.error('[App] Health check error:', err);
            alert('Failed to get health status: ' + err.message);
        } finally {
            setHealthLoading(false);
        }
    };

    const handleResetBreaker = async () => {
        try {
            const { resetBreaker } = await import('./api.js');
            await resetBreaker();
            // Refresh health after reset
            await handleCheckHealth();
        } catch (err) {
            alert('Failed to reset breaker: ' + err.message);
        }
    };

    // ── Get validation errors for display ──
    const errors = useMemo(() => {
        return {
            subject: touched.subject ? validateField('subject', context.subject) : '',
            topic: touched.topic ? validateField('topic', context.topic) : '',
            className: touched.className ? validateField('class', context.className) : '',
        };
    }, [context, touched, validateField]);

    // ── Render ──
    return (
        <div style={{
            maxWidth: 860,
            margin: '0 auto',
            padding: '20px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#222',
        }}>
            {/* Header */}
            <header style={{ marginBottom: 24 }}>
                <h1 style={{
                    fontSize: '2rem',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                }}>
                    OCR Demo Viewer
                </h1>
                <p style={{ color: '#666', margin: 0 }}>
                    Upload handwriting → your recognition service runs → see what it read
                </p>
                <p style={{ color: '#888', fontSize: '0.85em', marginTop: 4 }}>
                    <span style={{ backgroundColor: '#e8f5e9', padding: '2px 8px', borderRadius: 4 }}>
                        ✓ {file ? `File: ${file.name}` : 'No file selected'}
                    </span>
                </p>
            </header>

            {/* Uploader */}
            <Uploader
                file={file}
                onFile={setFile}
                preview={preview}
            />

            {/* Context Form — with validation */}
            <ContextForm
                subject={context.subject}
                topic={context.topic}
                className={context.className}
                onChange={handleContextChange}
                errors={errors}
                touched={touched}
            />

            {/* Ground Truth Input
            <div style={{ marginTop: 12 }}>
                <label style={{ fontWeight: 500, fontSize: '0.9em', display: 'block', marginBottom: 4 }}>
                    Ground Truth <span style={{ color: '#999', fontWeight: 'normal' }}>(optional — for comparison)</span>
                </label>
                <textarea
                    value={truth}
                    onChange={(e) => setTruth(e.target.value)}
                    placeholder="Paste the expected text here..."
                    style={{
                        width: '100%',
                        minHeight: '56px',
                        padding: '10px',
                        borderRadius: 4,
                        border: '1px solid #ccc',
                        fontSize: '0.95em',
                        fontFamily: 'monospace',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                    }}
                />
            </div> */}

            {/* Actions */}
            <div style={{
                marginTop: 16,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                alignItems: 'center',
            }}>
                <button
                    onClick={handleRecognize}
                    disabled={loading || !file || !isFormValid()}
                    style={{
                        padding: '10px 24px',
                        borderRadius: 6,
                        border: 'none',
                        backgroundColor: (loading || !file || !isFormValid()) ? '#ccc' : '#007bff',
                        color: (loading || !file || !isFormValid()) ? '#888' : '#fff',
                        fontSize: '1em',
                        fontWeight: 600,
                        cursor: (loading || !file || !isFormValid()) ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.2s',
                    }}
                    title={
                        !file ? 'Please select an image' :
                        !isFormValid() ? 'Please fill in all context fields' :
                        ''
                    }
                >
                    {loading ? 'Recognizing...' : 'Recognize'}
                </button>

                <button
                    onClick={handleCheckHealth}
                    disabled={healthLoading}
                    style={{
                        padding: '10px 16px',
                        borderRadius: 6,
                        border: '1px solid #6c757d',
                        backgroundColor: '#fff',
                        color: '#6c757d',
                        cursor: 'pointer',
                        fontSize: '0.95em',
                    }}
                >
                    {healthLoading ? '...' : ' Check Breaker'}
                </button>

                {/* ── Status indicator ── */}
                <span style={{
                    fontSize: '0.8em',
                    color: isFormValid() ? '#28a745' : '#dc3545',
                    marginLeft: 'auto',
                }}>
                    {isFormValid() ? (
                        'All fields filled'
                    ) : (
                        ' Fill all context fields'
                    )}
                </span>
            </div>

            {/* Error */}
            {error && (
                <div style={{
                    marginTop: 12,
                    padding: '12px 16px',
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: 4,
                    color: '#721c24',
                }}>
                    Error {error}
                </div>
            )}

            {/* Result */}
            <ResultPanel result={result} truth={truth} />

            {/* Breaker Status */}
            <BreakerStatus
                health={health}
                onRefresh={handleCheckHealth}
                loading={healthLoading}
            />

            {/* Footer */}
            <footer style={{
                marginTop: 32,
                paddingTop: 16,
                borderTop: '1px solid #eee',
                fontSize: '0.8em',
                color: '#999',
                textAlign: 'center',
            }}>
                <span>Provider: {result?.provider || '—'}</span>
                {' • '}
                <span>Degraded: {result?.degraded ? ' yes' : ' no'}</span>
                {' • '}
                <span>Math: {result?.has_math ? ' yes' : ' no'}</span>
                {' • '}
                <span>Legible: {result?.legible ? ' yes' : ' no'}</span>
            </footer>
        </div>
    );
}

export default App;