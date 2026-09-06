/**
 * Context Form Component
 * 
 * Controls that influence model selection:
 * - Subject → determines gpt-4o (math) vs gpt-4o-mini (other)
 * - Topic → context for disambiguation
 * - Class → grade/level context
 * 
 * ── All fields are REQUIRED ──
 * The Recognize button will be disabled until all fields are filled.
 */

const SUBJECTS = [
    '',
    'Mathematics',
    'Physics',
    'Chemistry',
    'Biology',
    'Computer Science',
    'English',
    'History',
    'Economics',
    'Art',
    'Music',
    'Physical Education',
    'Social Studies',
];

export default function ContextForm({ 
    subject, 
    topic, 
    className, 
    onChange,
    errors = {},
    touched = {},
}) {
    const handleChange = (field, value) => {
        onChange({ [field]: value });
    };

    // ── Check if field has error ──
    const hasError = (field) => {
        return errors[field] && touched[field];
    };

    // ── Get error message ──
    const getError = (field) => {
        return errors[field] || '';
    };

    return (
        <fieldset style={{
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: '16px',
            margin: '8px 0',
        }}>
            <legend style={{ 
                fontWeight: 'bold', 
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
            }}>
                <span> Context</span>
                <span style={{ 
                    fontWeight: 'normal', 
                    fontSize: '0.8em', 
                    color: '#dc3545',
                }}>
                    * All fields required
                </span>
            </legend>

            <div style={{ 
                display: 'grid', 
                gap: '12px', 
                gridTemplateColumns: '1fr 1fr 1fr',
            }}>
                {/* ── Subject ── */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ 
                        fontSize: '0.9em', 
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}>
                        Subject
                        <span style={{ color: '#dc3545' }}>*</span>
                    </span>
                    <select
                        value={subject}
                        onChange={(e) => handleChange('subject', e.target.value)}
                        style={{
                            padding: '8px',
                            borderRadius: 4,
                            border: hasError('subject') ? '2px solid #dc3545' : '1px solid #ccc',
                            fontSize: '0.95em',
                            backgroundColor: subject ? '#fff' : '#f8f9fa',
                            color: subject ? '#222' : '#999',
                            transition: 'border-color 0.2s',
                        }}
                    >
                        {SUBJECTS.map(s => (
                            <option key={s} value={s}>
                                {s || 'Select Subject'}
                            </option>
                        ))}
                    </select>
                    {hasError('subject') && (
                        <small style={{ color: '#dc3545', fontSize: '0.75em' }}>
                            {getError('subject')}
                        </small>
                    )}
                    
                </label>

                {/* ── Topic ── */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ 
                        fontSize: '0.9em', 
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}>
                        Topic
                        <span style={{ color: '#dc3545' }}>*</span>
                    </span>
                    <input
                        type="text"
                        value={topic}
                        placeholder="e.g. Quadratic equations"
                        onChange={(e) => handleChange('topic', e.target.value)}
                        style={{
                            padding: '8px',
                            borderRadius: 4,
                            border: hasError('topic') ? '2px solid #dc3545' : '1px solid #ccc',
                            fontSize: '0.95em',
                            transition: 'border-color 0.2s',
                        }}
                    />
                    {hasError('topic') && (
                        <small style={{ color: '#dc3545', fontSize: '0.75em' }}>
                            {getError('topic')}
                        </small>
                    )}
                    
                </label>

                {/* ── Class ── */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ 
                        fontSize: '0.9em', 
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}>
                        Class
                        <span style={{ color: '#dc3545' }}>*</span>
                    </span>
                    <input
                        type="text"
                        value={className}
                        placeholder="e.g. 10"
                        onChange={(e) => handleChange('className', e.target.value)}
                        style={{
                            padding: '8px',
                            borderRadius: 4,
                            border: hasError('className') ? '2px solid #dc3545' : '1px solid #ccc',
                            fontSize: '0.95em',
                            transition: 'border-color 0.2s',
                        }}
                    />
                    {hasError('className') && (
                        <small style={{ color: '#dc3545', fontSize: '0.75em' }}>
                            {getError('className')}
                        </small>
                    )}
                </label>
            </div>

            {/* ── Required fields note ── */}
            <div style={{ 
                marginTop: '12px',
                padding: '8px 12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px',
                fontSize: '0.8em',
                color: '#666',
            }}>
                <span style={{ color: '#dc3545' }}>*</span> All fields are required before you can recognize.
            </div>
        </fieldset>
    );
}