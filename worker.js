// ============================================
// FileTypeAnalyzer Web Worker
// Handles CPU-intensive tasks in parallel thread
// ============================================

// SHA-256 hash calculation
async function calculateHash(arrayBuffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Entropy calculation (Shannon entropy)
function calculateEntropy(bytes) {
    if (bytes.length === 0) return 0;

    const freq = new Array(256).fill(0);
    for (let i = 0; i < bytes.length; i++) {
        freq[bytes[i]]++;
    }

    let entropy = 0;
    const len = bytes.length;
    for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) {
            const p = freq[i] / len;
            entropy -= p * Math.log2(p);
        }
    }
    return entropy;
}

// Magic number database (compact version for worker)
const MAGIC_SIGNATURES = [
    { hex: '89504E47', type: 'PNG', category: 'Image' },
    { hex: 'FFD8FF', type: 'JPEG', category: 'Image' },
    { hex: '47494638', type: 'GIF', category: 'Image' },
    { hex: '25504446', type: 'PDF', category: 'Document' },
    { hex: '504B0304', type: 'ZIP/DOCX/XLSX', category: 'Archive' },
    { hex: 'D0CF11E0', type: 'DOC/XLS/PPT', category: 'Document' },
    { hex: '52617221', type: 'RAR', category: 'Archive' },
    { hex: '377ABCAF', type: '7Z', category: 'Archive' },
    { hex: '1F8B', type: 'GZIP', category: 'Archive' },
    { hex: '4D5A', type: 'EXE/DLL', category: 'Executable' },
    { hex: '7F454C46', type: 'ELF', category: 'Executable' },
    { hex: '494433', type: 'MP3', category: 'Audio' },
    { hex: '1A45DFA3', type: 'MKV/WEBM', category: 'Video' },
    { hex: '00000018', type: 'MP4', category: 'Video' },
    { hex: '00000020', type: 'MP4', category: 'Video' }
];

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function detectType(bytes) {
    const hex = bytesToHex(bytes.slice(0, 16));
    for (const sig of MAGIC_SIGNATURES) {
        if (hex.startsWith(sig.hex)) {
            return { type: sig.type, category: sig.category };
        }
    }
    return { type: 'Unknown', category: 'Unknown' };
}

// Message handler
self.onmessage = async function (e) {
    const { id, task, data } = e.data;

    try {
        let result;

        switch (task) {
            case 'hash':
                result = await calculateHash(data);
                break;

            case 'entropy':
                result = calculateEntropy(new Uint8Array(data));
                break;

            case 'detect':
                result = detectType(new Uint8Array(data));
                break;

            case 'analyze':
                // Full analysis in one call
                const bytes = new Uint8Array(data.buffer);
                const typeInfo = detectType(bytes);
                const entropy = calculateEntropy(bytes.slice(0, 65536)); // First 64KB
                const hash = await calculateHash(data.buffer);
                result = { ...typeInfo, entropy, hash };
                break;

            default:
                throw new Error('Unknown task: ' + task);
        }

        self.postMessage({ id, success: true, result });

    } catch (error) {
        self.postMessage({ id, success: false, error: error.message });
    }
};

self.postMessage({ type: 'ready' });
