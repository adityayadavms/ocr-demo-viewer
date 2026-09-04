/**
 * API Client for OCR Demo Viewer
 * 
 * All requests are proxied through Vite to avoid CORS issues.
 * See web/vite.config.js for proxy configuration.
 */

/**
 * Send an image for handwriting recognition
 * 
 * @param {Object} params
 * @param {File} params.file - PNG image file
 * @param {string} params.subject - Subject name (drives model selection)
 * @param {string} params.topic - Topic for context
 * @param {string} params.className - Class/grade level
 * @returns {Promise<Object>} Recognition result
 */
export async function recognize({ file, subject, topic, className }) {
    // Validate
    if (!file) {
        throw new Error('No file selected');
    }
    
    // Check if it's a PNG
    if (!file.type || !file.type.includes('png')) {
        console.warn('[API] File may not be PNG:', file.type);
        // Note: The backend does a magic-byte check, so invalid files will be rejected
    }
    
    const formData = new FormData();
    formData.append('boardImage', file, file.name || 'board.png');
    formData.append('subject', subject || '');
    formData.append('topic', topic || '');
    formData.append('class', className || '');
    
    // CRITICAL: Do NOT set Content-Type header!
    // The browser will set it with the correct multipart boundary.
    
    const response = await fetch('/recognize', {
        method: 'POST',
        body: formData,
    });
    
    // Parse response
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error('Invalid response from server');
    }
    
    if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    return data;
}

/**
 * Get circuit breaker health status
 * 
 * @returns {Promise<Object>} Health status
 */
export async function getHealth() {
    const response = await fetch('/health');
    if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
    }
    return response.json();
}

/**
 * Manually reset the circuit breaker
 * 
 * @returns {Promise<Object>} Reset result
 */
export async function resetBreaker() {
    const response = await fetch('/reset-breaker', {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`Reset failed: ${response.status}`);
    }
    return response.json();
}