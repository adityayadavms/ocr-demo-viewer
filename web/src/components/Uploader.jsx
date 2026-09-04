/**
 * Uploader Component
 * 
 * File input with preview for PNG images.
 * The backend does a magic-byte check and rejects non-PNG files.
 */

import { useRef } from 'react';

export default function Uploader({ file, onFile, preview }) {
    const inputRef = useRef(null);

    const handleClick = () => {
        inputRef.current?.click();
    };

    const handleChange = (e) => {
        const selectedFile = e.target.files?.[0] || null;
        onFile(selectedFile);
        // Reset input so the same file can be selected again
        e.target.value = '';
    };

    return (
        <div style={{
            border: '2px dashed #ccc',
            borderRadius: 8,
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
            backgroundColor: file ? '#f0f7ff' : 'transparent',
        }}
        onClick={handleClick}
        onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = '#007bff';
        }}
        onDragLeave={(e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = '#ccc';
        }}
        onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = '#ccc';
            const droppedFile = e.dataTransfer.files?.[0] || null;
            if (droppedFile) {
                onFile(droppedFile);
            }
        }}
        >
            <input
                ref={inputRef}
                type="file"
                accept="image/png"
                onChange={handleChange}
                style={{ display: 'none' }}
            />

            {file ? (
                <div>
                    <div style={{ fontSize: '2em' }}></div>
                    <div style={{ fontWeight: 'bold', marginTop: 8 }}>{file.name}</div>
                    <div style={{ color: '#666', fontSize: '0.9em' }}>
                        {(file.size / 1024).toFixed(1)} KB
                    </div>
                    <div style={{ color: '#28a745', fontSize: '0.9em', marginTop: 4 }}>
                        ✓ PNG ready
                    </div>
                </div>
            ) : (
                <div>
                    <div style={{ fontSize: '3em' }}></div>
                    <div style={{ fontWeight: 'bold', marginTop: 8 }}>
                        Click or drag to upload a PNG
                    </div>
                    <div style={{ color: '#666', fontSize: '0.9em' }}>
                        PNG only — max 10MB
                    </div>
                </div>
            )}

            {preview && (
                <div style={{ marginTop: 16 }}>
                    <img
                        src={preview}
                        alt="Preview"
                        style={{
                            maxWidth: '100%',
                            maxHeight: '300px',
                            borderRadius: 4,
                            border: '1px solid #eee',
                            objectFit: 'contain',
                        }}
                    />
                </div>
            )}
        </div>
    );
}