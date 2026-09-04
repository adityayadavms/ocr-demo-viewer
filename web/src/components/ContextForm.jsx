/**
 * Context Form Component
 * 
 * Controls that influence model selection:
 * - Subject → determines gpt-4o (math) vs gpt-4o-mini (other)
 * - Topic → context for disambiguation
 * - Class → grade/level context
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

export default function ContextForm({ subject, topic, className, onChange }) {
    const handleChange = (field, value) => {
        onChange({ [field]: value });
    };

    return (
        <fieldset style={{
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: '16px',
            margin: '8px 0',
        }}>
            <legend style={{ fontWeight: 'bold', padding: '0 8px' }}>
                 Context
                <span style={{ fontWeight: 'normal', fontSize: '0.8em', color: '#666', marginLeft: 8 }}>
                    (changes the model used)
                </span>
            </legend>

            <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: '1fr 1fr 1fr' }}>
                {/* Subject */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.9em', fontWeight: 500 }}>Subject</span>
                    <select
                        value={subject}
                        onChange={(e) => handleChange('subject', e.target.value)}
                        style={{
                            padding: '8px',
                            borderRadius: 4,
                            border: '1px solid #ccc',
                            fontSize: '0.95em',
                        }}
                    >
                        {SUBJECTS.map(s => (
                            <option key={s} value={s}>
                                {s || 'Select Subject'}
                            </option>
                        ))}
                    </select>
                </label>

                {/* Topic */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.9em', fontWeight: 500 }}>Topic</span>
                    <input
                        type="text"
                        value={topic}
                        placeholder="e.g. Quadratic equations"
                        onChange={(e) => handleChange('topic', e.target.value)}
                        style={{
                            padding: '8px',
                            borderRadius: 4,
                            border: '1px solid #ccc',
                            fontSize: '0.95em',
                        }}
                    />
                    <small style={{ color: '#666', fontSize: '0.75em' }}>
                        Context for disambiguation
                    </small>
                </label>

                {/* Class */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.9em', fontWeight: 500 }}>Class</span>
                    <input
                        type="text"
                        value={className}
                        placeholder="e.g. 10"
                        onChange={(e) => handleChange('className', e.target.value)}
                        style={{
                            padding: '8px',
                            borderRadius: 4,
                            border: '1px solid #ccc',
                            fontSize: '0.95em',
                        }}
                    />
                    <small style={{ color: '#666', fontSize: '0.75em' }}>
                        Grade/level context
                    </small>
                </label>
            </div>
        </fieldset>
    );
}