// ============================================
// FileTypeAnalyzer Pro v2.0 - Enhanced Edition
// Features: Hash calculation, Entropy analysis,
// Hex viewer, Theme toggle, History, Previews
// ============================================

// ============================================
// Performance HUD Logic (Game Overlay) - Defined Early
// ============================================

class DynamicTaskQueue {
    constructor(concurrency = 4) {
        this.concurrency = concurrency;
        this.queue = [];
        this.activeCount = 0;
        this.results = [];
        this.onProgress = null;
        this.onComplete = null;
        this.paused = false;

        // Stats for ETA
        this.times = [];
        this.startTime = 0;
        this.totalTasks = 0;
    }

    add(items) {
        this.queue.push(...items);
        this.totalTasks += items.length;
    }

    start(handler) {
        this.handler = handler;
        this.startTime = performance.now();
        this.process();
    }

    async process() {
        if (this.paused) return;

        while (this.activeCount < this.concurrency && this.queue.length > 0) {
            this.activeCount++;
            const item = this.queue.shift();
            const startStr = performance.now();

            this.handler(item).then(result => {
                this.activeCount--;
                this.results.push(result);

                // Track time for ETA
                const duration = performance.now() - startStr;
                this.times.push(duration);
                if (this.times.length > 50) this.times.shift(); // Moving average window

                if (this.onProgress) {
                    this.onProgress({
                        completed: this.results.length,
                        total: this.totalTasks,
                        active: this.activeCount,
                        queueLen: this.queue.length,
                        avgTime: this.getAverageTime()
                    });
                }

                this.process(); // Trigger next
            }).catch(err => {
                console.error("Task failed", err);
                this.activeCount--;
                this.process();
            });
        }

        if (this.activeCount === 0 && this.queue.length === 0 && this.onComplete) {
            this.onComplete(this.results);
        }
    }

    getAverageTime() {
        if (this.times.length === 0) return 0;
        const sum = this.times.reduce((a, b) => a + b, 0);
        return sum / this.times.length;
    }
}

class PerformanceGraph {
    constructor(canvasId, color) {
        this.canvas = document.getElementById(canvasId);
        // Fallback if canvas is missing to prevent crash
        if (!this.canvas) {
            console.warn(`Canvas ID ${canvasId} not found`);
            this.ctx = { clearRect: () => { }, strokeStyle: '', lineWidth: 0, beginPath: () => { }, moveTo: () => { }, lineTo: () => { }, stroke: () => { }, fillStyle: '', fill: () => { } };
            this.canvas = { width: 100, height: 50 }; // Provide a dummy canvas object
            this.update = () => { }; // Disable update
            this.draw = () => { };   // Disable draw
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.color = color;
        this.data = new Array(50).fill(0); // Keep last 50 data points
        this.max = 1;
    }

    update(value) {
        this.data.push(value);
        this.data.shift();

        // Dynamic scaling
        const currentMax = Math.max(...this.data);
        if (currentMax > this.max) this.max = currentMax;
        else this.max = Math.max(1, this.max * 0.99); // Slowly decay max

        this.draw();
    }

    draw() {
        const { width, height } = this.canvas;
        const ctx = this.ctx;

        ctx.clearRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Draw line
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        const step = width / (this.data.length - 1);

        this.data.forEach((val, i) => {
            const x = i * step;
            const y = height - ((val / this.max) * height);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        ctx.stroke();

        // Draw fill
        ctx.fillStyle = this.color.replace(')', ', 0.1)').replace('rgb', 'rgba');
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.fill();
    }
}

class PerformanceHud {
    constructor() {
        this.el = document.getElementById('perfHud');
        this.statusEl = document.getElementById('perfStatus');
        this.speedEl = document.getElementById('hudSpeed');
        this.memEl = document.getElementById('hudMemory');
        this.cpuEl = document.getElementById('hudCpu');
        this.etaEl = document.getElementById('hudEta'); // NEW ETA ELEMENT
        this.threadViz = document.getElementById('threadViz');

        this.speedGraph = new PerformanceGraph('speedGraph', 'rgb(34, 197, 94)'); // Green
        this.memGraph = new PerformanceGraph('memGraph', 'rgb(99, 102, 241)');   // Indigo

        // Initialize thread blocks
        const cores = navigator.hardwareConcurrency || 4;
        if (this.threadViz) {
            this.threadViz.innerHTML = '';
            for (let i = 0; i < cores; i++) {
                const block = document.createElement('div');
                block.className = 'thread-block';
                this.threadViz.appendChild(block);
            }
            this.threadBlocks = this.threadViz.children;
        } else {
            this.threadBlocks = [];
        }
    }

    show() {
        if (this.el) this.el.classList.remove('hidden');
    }

    hide() {
        if (this.el) this.el.classList.add('hidden');
    }

    setStatus(status) {
        if (this.statusEl) this.statusEl.textContent = status;
        if (this.el) this.el.classList.remove('hidden'); // Auto-show on status change
    }

    updateStats(metrics) {
        // Update Speed
        if (metrics.mbPerSec !== undefined) {
            if (this.speedEl) this.speedEl.textContent = `${metrics.mbPerSec} MB/s`;
            this.speedGraph.update(parseFloat(metrics.mbPerSec));
        }

        // Update Memory
        if (performance.memory) {
            const used = performance.memory.usedJSHeapSize / (1024 * 1024);
            const limit = performance.memory.jsHeapSizeLimit / (1024 * 1024);
            if (this.memEl) this.memEl.textContent = `${used.toFixed(0)} / ${limit.toFixed(0)} MB`;
            this.memGraph.update(used);
        } else {
            this.memGraph.update(Math.random() * 50 + 50); // Simulation (Firefox)
        }

        // Update Threads (visual effect - simulate load)
        const activeThreads = metrics.activeThreads || 0;
        if (this.cpuEl) this.cpuEl.textContent = `${activeThreads} Active`;

        if (this.threadBlocks) {
            Array.from(this.threadBlocks).forEach((block, i) => {
                if (i < activeThreads) block.classList.add('active');
                else block.classList.remove('active');
            });
        }

        // Update ETA (NEW)
        if (metrics.etaSeconds !== undefined && this.etaEl) {
            const mins = Math.floor(metrics.etaSeconds / 60);
            const secs = Math.floor(metrics.etaSeconds % 60);
            this.etaEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }
}

// Global HUD Instance - define safely
let hud;
document.addEventListener('DOMContentLoaded', () => {
    hud = new PerformanceHud();
});

// Magic Number Database (40+ file types)
const magicDatabase = [
    // Images
    { hex: '89504E47', type: 'PNG', category: 'Image', description: 'Portable Network Graphics', extensions: ['.png'] },
    { hex: 'FFD8FFE0', type: 'JPEG', category: 'Image', description: 'JPEG Image (JFIF)', extensions: ['.jpg', '.jpeg'] },
    { hex: 'FFD8FFE1', type: 'JPEG', category: 'Image', description: 'JPEG Image (EXIF)', extensions: ['.jpg', '.jpeg'] },
    { hex: 'FFD8FFDB', type: 'JPEG', category: 'Image', description: 'JPEG Image', extensions: ['.jpg', '.jpeg'] },
    { hex: 'FFD8FFEE', type: 'JPEG', category: 'Image', description: 'JPEG Image', extensions: ['.jpg', '.jpeg'] },
    { hex: '47494638', type: 'GIF', category: 'Image', description: 'Graphics Interchange Format', extensions: ['.gif'] },
    { hex: '424D', type: 'BMP', category: 'Image', description: 'Bitmap Image', extensions: ['.bmp'] },
    { hex: '38425053', type: 'PSD', category: 'Image', description: 'Adobe Photoshop Document', extensions: ['.psd'] },
    { hex: '49492A00', type: 'TIFF', category: 'Image', description: 'Tagged Image File Format', extensions: ['.tiff', '.tif'] },
    { hex: '4D4D002A', type: 'TIFF', category: 'Image', description: 'Tagged Image File Format', extensions: ['.tiff', '.tif'] },
    { hex: '00000100', type: 'ICO', category: 'Image', description: 'Windows Icon', extensions: ['.ico'] },
    { hex: '52494646', type: 'WEBP/WAV/AVI', category: 'Media', description: 'RIFF Container', extensions: ['.webp', '.wav', '.avi'] },

    // Documents
    { hex: '25504446', type: 'PDF', category: 'Document', description: 'Portable Document Format', extensions: ['.pdf'] },
    { hex: 'D0CF11E0A1B11AE1', type: 'DOC/XLS/PPT', category: 'Document', description: 'Microsoft Office Legacy', extensions: ['.doc', '.xls', '.ppt'] },
    { hex: '504B0304', type: 'ZIP/DOCX/XLSX', category: 'Archive', description: 'ZIP Archive or Office Open XML', extensions: ['.zip', '.docx', '.xlsx', '.pptx', '.jar', '.apk'] },
    { hex: '504B0506', type: 'ZIP', category: 'Archive', description: 'ZIP Archive (empty)', extensions: ['.zip'] },
    { hex: '504B0708', type: 'ZIP', category: 'Archive', description: 'ZIP Archive (spanned)', extensions: ['.zip'] },
    { hex: '7B5C727466', type: 'RTF', category: 'Document', description: 'Rich Text Format', extensions: ['.rtf'] },

    // Archives
    { hex: '52617221', type: 'RAR', category: 'Archive', description: 'RAR Archive', extensions: ['.rar'] },
    { hex: '377ABCAF271C', type: '7Z', category: 'Archive', description: '7-Zip Archive', extensions: ['.7z'] },
    { hex: '1F8B', type: 'GZIP', category: 'Archive', description: 'GZIP Compressed', extensions: ['.gz', '.gzip'] },
    { hex: '425A68', type: 'BZ2', category: 'Archive', description: 'BZIP2 Compressed', extensions: ['.bz2'] },
    { hex: 'FD377A585A00', type: 'XZ', category: 'Archive', description: 'XZ Compressed', extensions: ['.xz'] },
    { hex: '1F9D', type: 'Z', category: 'Archive', description: 'LZW Compressed', extensions: ['.z'] },

    // Audio
    { hex: '494433', type: 'MP3', category: 'Audio', description: 'MP3 Audio (ID3)', extensions: ['.mp3'] },
    { hex: 'FFFB', type: 'MP3', category: 'Audio', description: 'MP3 Audio', extensions: ['.mp3'] },
    { hex: 'FFF3', type: 'MP3', category: 'Audio', description: 'MP3 Audio', extensions: ['.mp3'] },
    { hex: 'FFF2', type: 'MP3', category: 'Audio', description: 'MP3 Audio', extensions: ['.mp3'] },
    { hex: '664C6143', type: 'FLAC', category: 'Audio', description: 'Free Lossless Audio Codec', extensions: ['.flac'] },
    { hex: '4F676753', type: 'OGG', category: 'Audio', description: 'OGG Vorbis', extensions: ['.ogg'] },

    // Video
    { hex: '1A45DFA3', type: 'MKV/WEBM', category: 'Video', description: 'Matroska/WebM Video', extensions: ['.mkv', '.webm'] },
    { hex: '464C56', type: 'FLV', category: 'Video', description: 'Flash Video', extensions: ['.flv'] },
    { hex: '000001BA', type: 'MPEG', category: 'Video', description: 'MPEG Video', extensions: ['.mpg', '.mpeg'] },
    { hex: '000001B3', type: 'MPEG', category: 'Video', description: 'MPEG Video', extensions: ['.mpg', '.mpeg'] },
    { hex: '00000018', type: 'MP4', category: 'Video', description: 'MPEG-4 Video', extensions: ['.mp4', '.m4v'] },
    { hex: '00000020', type: 'MP4', category: 'Video', description: 'MPEG-4 Video', extensions: ['.mp4', '.m4v'] },
    { hex: '0000001C', type: 'MP4', category: 'Video', description: 'MPEG-4 Video', extensions: ['.mp4', '.m4v'] },

    // Executables
    { hex: '4D5A', type: 'EXE/DLL', category: 'Executable', description: 'Windows Executable', extensions: ['.exe', '.dll', '.sys'] },
    { hex: '7F454C46', type: 'ELF', category: 'Executable', description: 'Linux Executable', extensions: [''] },
    { hex: 'CAFEBABE', type: 'CLASS', category: 'Executable', description: 'Java Class File', extensions: ['.class'] },
    { hex: 'FEEDFACE', type: 'MACH-O', category: 'Executable', description: 'macOS Executable (32-bit)', extensions: [''] },
    { hex: 'FEEDFACF', type: 'MACH-O', category: 'Executable', description: 'macOS Executable (64-bit)', extensions: [''] },
    { hex: '6465780A', type: 'DEX', category: 'Executable', description: 'Android Dalvik Executable', extensions: ['.dex'] },

    // Database
    { hex: '53514C69746520666F726D6174', type: 'SQLITE', category: 'Database', description: 'SQLite Database', extensions: ['.db', '.sqlite', '.sqlite3'] },

    // Web/Code
    { hex: '3C3F786D6C', type: 'XML', category: 'Data', description: 'XML Document', extensions: ['.xml'] },
    { hex: '3C21444F43545950', type: 'HTML', category: 'Web', description: 'HTML Document', extensions: ['.html', '.htm'] },
    { hex: '3C68746D6C', type: 'HTML', category: 'Web', description: 'HTML Document', extensions: ['.html', '.htm'] },
    { hex: '3C21646F63', type: 'HTML', category: 'Web', description: 'HTML Document', extensions: ['.html', '.htm'] },

    // Fonts
    { hex: '00010000', type: 'TTF', category: 'Font', description: 'TrueType Font', extensions: ['.ttf'] },
    { hex: '4F54544F', type: 'OTF', category: 'Font', description: 'OpenType Font', extensions: ['.otf'] },
    { hex: '774F4646', type: 'WOFF', category: 'Font', description: 'Web Open Font Format', extensions: ['.woff'] },
    { hex: '774F4632', type: 'WOFF2', category: 'Font', description: 'Web Open Font Format 2', extensions: ['.woff2'] },

    // Other
    { hex: '25215053', type: 'PS', category: 'Document', description: 'PostScript', extensions: ['.ps', '.eps'] },
    { hex: '4344303031', type: 'ISO', category: 'Disk', description: 'ISO Disk Image', extensions: ['.iso'] },
];

// Extension to type mapping for fallback detection
const extensionMap = {
    '.txt': { type: 'Text', category: 'Text', description: 'Plain text file' },
    '.log': { type: 'Log', category: 'Text', description: 'Log file' },
    '.md': { type: 'Markdown', category: 'Text', description: 'Markdown document' },
    '.csv': { type: 'CSV', category: 'Data', description: 'Comma-separated values' },
    '.json': { type: 'JSON', category: 'Data', description: 'JSON data file' },
    '.yaml': { type: 'YAML', category: 'Data', description: 'YAML data file' },
    '.yml': { type: 'YAML', category: 'Data', description: 'YAML data file' },
    '.cpp': { type: 'C++', category: 'Code', description: 'C++ source file' },
    '.c': { type: 'C', category: 'Code', description: 'C source file' },
    '.h': { type: 'Header', category: 'Code', description: 'C/C++ header file' },
    '.hpp': { type: 'Header', category: 'Code', description: 'C++ header file' },
    '.py': { type: 'Python', category: 'Code', description: 'Python script' },
    '.js': { type: 'JavaScript', category: 'Code', description: 'JavaScript file' },
    '.ts': { type: 'TypeScript', category: 'Code', description: 'TypeScript file' },
    '.java': { type: 'Java', category: 'Code', description: 'Java source file' },
    '.cs': { type: 'C#', category: 'Code', description: 'C# source file' },
    '.go': { type: 'Go', category: 'Code', description: 'Go source file' },
    '.rs': { type: 'Rust', category: 'Code', description: 'Rust source file' },
    '.rb': { type: 'Ruby', category: 'Code', description: 'Ruby script' },
    '.swift': { type: 'Swift', category: 'Code', description: 'Swift source file' },
    '.kt': { type: 'Kotlin', category: 'Code', description: 'Kotlin source file' },
    '.html': { type: 'HTML', category: 'Web', description: 'HTML document' },
    '.htm': { type: 'HTML', category: 'Web', description: 'HTML document' },
    '.css': { type: 'CSS', category: 'Web', description: 'Cascading Style Sheet' },
    '.scss': { type: 'SCSS', category: 'Web', description: 'Sass stylesheet' },
    '.less': { type: 'LESS', category: 'Web', description: 'Less stylesheet' },
    '.php': { type: 'PHP', category: 'Web', description: 'PHP script' },
    '.sql': { type: 'SQL', category: 'Database', description: 'SQL script' },
    '.sh': { type: 'Shell', category: 'Script', description: 'Shell script' },
    '.bash': { type: 'Bash', category: 'Script', description: 'Bash script' },
    '.bat': { type: 'Batch', category: 'Script', description: 'Windows batch file' },
    '.ps1': { type: 'PowerShell', category: 'Script', description: 'PowerShell script' },
    '.ini': { type: 'INI', category: 'Config', description: 'Configuration file' },
    '.cfg': { type: 'Config', category: 'Config', description: 'Configuration file' },
    '.conf': { type: 'Config', category: 'Config', description: 'Configuration file' },
};

// ============================================
// State Management
// ============================================
let analysisResults = [];
let currentFileData = new Map(); // Store file blobs for preview/hash
let pieChart = null;
let barChart = null;

// ============================================
// Web Worker Pool for CPU Parallelism
// ============================================
const WORKER_COUNT = navigator.hardwareConcurrency || 4; // Use all CPU cores
let workerPool = [];
let workerQueue = [];
let workerIdCounter = 0;

function initWorkerPool() {
    try {
        for (let i = 0; i < WORKER_COUNT; i++) {
            const worker = new Worker('worker.js');
            worker.busy = false;
            worker.onmessage = handleWorkerMessage;
            worker.onerror = (e) => console.error('Worker error:', e);
            workerPool.push(worker);
        }
        console.log(`Worker pool initialized with ${WORKER_COUNT} threads (CPU cores: ${navigator.hardwareConcurrency})`);
    } catch (e) {
        console.warn('Web Workers not supported, using main thread:', e);
    }
}

function handleWorkerMessage(e) {
    const worker = e.target;
    const { id, success, result, error, type } = e.data;

    if (type === 'ready') return;

    // Find and resolve the pending task
    const taskIndex = workerQueue.findIndex(t => t.id === id);
    if (taskIndex >= 0) {
        const task = workerQueue.splice(taskIndex, 1)[0];
        if (success) {
            task.resolve(result);
        } else {
            task.reject(new Error(error));
        }
    }

    worker.busy = false;
    processQueue();
}

function processQueue() {
    const freeWorker = workerPool.find(w => !w.busy);
    const pendingTask = workerQueue.find(t => !t.sent);

    if (freeWorker && pendingTask) {
        freeWorker.busy = true;
        pendingTask.sent = true;
        freeWorker.postMessage({
            id: pendingTask.id,
            task: pendingTask.task,
            data: pendingTask.data
        });
    }
}

function runOnWorker(task, data) {
    return new Promise((resolve, reject) => {
        if (workerPool.length === 0) {
            // Fallback to main thread
            reject(new Error('No workers available'));
            return;
        }

        const id = workerIdCounter++;
        workerQueue.push({ id, task, data, resolve, reject, sent: false });
        processQueue();
    });
}

// Initialize workers on load
if (typeof Worker !== 'undefined') {
    initWorkerPool();
}

// ============================================
// DOM Elements
// ============================================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const singleFileInput = document.getElementById('singleFileInput');
const loadingSection = document.getElementById('loadingSection');
const resultsSection = document.getElementById('resultsSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('searchInput');
const filterSelect = document.getElementById('filterSelect');
const exportBtn = document.getElementById('exportBtn');
const resetBtn = document.getElementById('resetBtn');
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeModal = document.getElementById('closeModal');
const themeToggle = document.getElementById('themeToggle');
const historyBtn = document.getElementById('historyBtn');
const historyModal = document.getElementById('historyModal');
const closeHistory = document.getElementById('closeHistory');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const fileDetailModal = document.getElementById('fileDetailModal');
const closeFileDetail = document.getElementById('closeFileDetail');
const fixExtensionsBtn = document.getElementById('fixExtensionsBtn');

// ============================================
// Utility Functions
// ============================================

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join('');
}

function hexToFormattedView(bytes, bytesPerLine = 16) {
    const lines = [];
    const asciiLines = [];

    for (let i = 0; i < bytes.length; i += bytesPerLine) {
        const offset = i.toString(16).padStart(8, '0').toUpperCase();
        const slice = bytes.slice(i, i + bytesPerLine);

        // Hex part
        const hexParts = [];
        for (let j = 0; j < bytesPerLine; j++) {
            if (j < slice.length) {
                hexParts.push(slice[j].toString(16).padStart(2, '0').toUpperCase());
            } else {
                hexParts.push('  ');
            }
        }
        const hexStr = hexParts.join(' ');

        // ASCII part
        let asciiStr = '';
        for (let j = 0; j < slice.length; j++) {
            const b = slice[j];
            asciiStr += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        }

        lines.push(`${offset}  ${hexStr}`);
        asciiLines.push(asciiStr);
    }

    return { hex: lines.join('\n'), ascii: asciiLines.join('\n') };
}

function getFileExtension(filename) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.substring(lastDot).toLowerCase() : '';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

// ============================================
// Cryptographic Hash Functions
// ============================================

async function calculateSHA256(arrayBuffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// Entropy Calculation
// ============================================

function calculateEntropy(bytes) {
    if (bytes.length === 0) return 0;

    // Count byte frequencies
    const freq = new Array(256).fill(0);
    for (let i = 0; i < bytes.length; i++) {
        freq[bytes[i]]++;
    }

    // Calculate Shannon entropy
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

function getEntropyLevel(entropy) {
    if (entropy < 4) return { level: 'Low', class: 'entropy-low', description: 'Text/Code' };
    if (entropy < 7) return { level: 'Medium', class: 'entropy-medium', description: 'Normal file' };
    return { level: 'High', class: 'entropy-high', description: 'Encrypted/Compressed' };
}

// ============================================
// File Analysis Functions
// ============================================

async function analyzeFile(file) {
    return new Promise(async (resolve) => {
        const result = {
            name: file.name,
            path: file.webkitRelativePath || file.name,
            size: file.size,
            sizeFormatted: formatFileSize(file.size),
            actualExtension: getFileExtension(file.name),
            type: 'Unknown',
            category: 'Unknown',
            description: 'Unrecognized file type',
            isCorrupt: false,
            extensionMismatch: false,
            entropy: 0,
            entropyLevel: { level: 'Unknown', class: '', description: '' },
            hash: 'Calculating...',
            hexPreview: '',
            isEncrypted: false,
            mimeType: file.type || 'unknown'
        };

        try {
            // Read file for analysis
            const arrayBuffer = await file.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            // Store file for later use
            currentFileData.set(file.name, { file, bytes, arrayBuffer });

            // Check for empty/corrupt files
            if (bytes.length < 2) {
                result.type = 'Empty/Corrupt';
                result.category = 'Error';
                result.description = 'File too small to identify';
                result.isCorrupt = true;
                result.hash = 'N/A';
                resolve(result);
                return;
            }

            // Get hex preview (first 64 bytes for detection)
            const headerBytes = bytes.slice(0, 64);
            const hex = bytesToHex(headerBytes);
            result.hexPreview = hex.substring(0, 64);

            // Calculate entropy (use sample for large files)
            const sampleSize = Math.min(bytes.length, 65536);
            const sampleBytes = bytes.slice(0, sampleSize);
            result.entropy = calculateEntropy(sampleBytes);
            result.entropyLevel = getEntropyLevel(result.entropy);
            result.isEncrypted = result.entropy >= 7.5;

            // Try to match magic number
            for (const sig of magicDatabase) {
                if (hex.startsWith(sig.hex)) {
                    result.type = sig.type;
                    result.category = sig.category;
                    result.description = sig.description;

                    // Check for extension mismatch
                    if (sig.extensions && sig.extensions.length > 0 && result.actualExtension) {
                        if (!sig.extensions.includes(result.actualExtension)) {
                            result.extensionMismatch = true;
                        }
                    }
                    break;
                }
            }

            // Fallback to extension-based detection
            if (result.type === 'Unknown' && result.actualExtension && extensionMap[result.actualExtension]) {
                const fallback = extensionMap[result.actualExtension];
                result.type = fallback.type;
                result.category = fallback.category;
                result.description = fallback.description;
            }

            // Calculate hash (async)
            calculateSHA256(arrayBuffer).then(hash => {
                result.hash = hash;
                // Update table if visible (SECURITY: use CSS.escape to prevent selector injection)
                const safeName = CSS.escape(result.name);
                const hashCell = document.querySelector(`[data-file="${safeName}"] .hash-cell`);
                if (hashCell) hashCell.textContent = hash.substring(0, 16) + '...';
            });

            resolve(result);

        } catch (error) {
            result.type = 'Unreadable';
            result.category = 'Error';
            result.description = 'Could not read file: ' + error.message;
            result.isCorrupt = true;
            result.hash = 'Error';
            resolve(result);
        }
    });
}

async function analyzeFiles(files) {
    const fileArray = Array.from(files);

    if (fileArray.length === 0) {
        showToast('No files selected', 'warning');
        return;
    }

    // Show loading
    document.querySelector('.drop-section').classList.add('hidden');
    loadingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');

    analysisResults = [];
    currentFileData.clear();

    // DYNAMIC CONCURRENCY CALCULATION - AGGRESSIVE TUNING (MAX SPEED)
    const totalFiles = fileArray.length;
    const totalSize = fileArray.reduce((acc, f) => acc + f.size, 0);
    const avgSize = totalSize / totalFiles;

    let concurrency = navigator.hardwareConcurrency || 4;
    // Tuning Profile
    if (avgSize < 1024 * 1024) concurrency = 128;      // Small files (<1MB): INSANE SPEED
    else if (avgSize > 50 * 1024 * 1024) concurrency = 4; // Large files (>50MB): Safety Mode
    else concurrency = 32;                             // Balanced Mode

    console.log(`Starting analysis with Concurrency: ${concurrency} (Avg Size: ${(avgSize / 1024).toFixed(1)} KB)`);

    // Performance Stats Tracking
    const startTime = performance.now();
    let totalBytesProcessed = 0;

    // UI Throttling (60 FPS Limit)
    let lastUpdate = 0;
    const UPDATE_INTERVAL = 16; // ms

    // UI Elements for Stats
    const memEl = document.getElementById('memoryUsage');
    const speedEl = document.getElementById('processingSpeed');
    const timeEl = document.getElementById('elapsedTime');

    // Reset stats display
    if (memEl) memEl.textContent = '--';
    if (speedEl) speedEl.textContent = 'Calculating...';
    if (timeEl) timeEl.textContent = '0.0s';

    // Initialize HUD
    hud.setStatus('ANALYZING');

    // Initialize Engine
    const queue = new DynamicTaskQueue(concurrency);

    // Setup Progress Handler
    queue.onProgress = (stats) => {
        // Throttle UI Updates to prevent Main Thread Choke
        const now = performance.now();
        if (now - lastUpdate < UPDATE_INTERVAL && stats.completed < stats.total) return;
        lastUpdate = now;

        // Update Progress Bar
        const progress = (stats.completed / stats.total) * 100;
        progressFill.style.width = progress + '%';
        progressText.textContent = `${Math.round(progress)}% (${stats.completed}/${stats.total})`;

        const elapsedSeconds = (now - startTime) / 1000;
        let mbPerSec = 0;

        if (elapsedSeconds > 0) {
            const mbProcessed = totalBytesProcessed / (1024 * 1024);
            mbPerSec = (mbProcessed / elapsedSeconds).toFixed(1);
        }

        // Calculate ETA
        // Formula: (AvgTimePerTask * RemainingTasks) / Concurrency
        const remainingTasks = stats.total - stats.completed;
        const etaSeconds = (stats.avgTime * remainingTasks) / 1000 / Math.max(1, stats.active);

        // Update HUD
        hud.updateStats({
            mbPerSec: mbPerSec,
            activeThreads: stats.active,
            etaSeconds: etaSeconds
        });

        // 1. Elapsed Time
        if (timeEl) timeEl.textContent = elapsedSeconds.toFixed(1) + 's';

        // 2. Processing Speed
        if (speedEl && elapsedSeconds > 0) {
            const filesPerSec = (stats.completed / elapsedSeconds).toFixed(0);
            speedEl.innerHTML = `${filesPerSec} files/s <span style="font-size:0.8em; opacity:0.7">(${mbPerSec} MB/s)</span>`;
        }

        // 3. Memory Usage
        if (memEl && performance.memory) {
            const usedMB = (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(0);
            const limitMB = (performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
            memEl.textContent = `${usedMB} MB / ${limitMB} MB`;
        }
    };

    queue.onComplete = (results) => {
        analysisResults = results;

        // Save to history
        saveToHistory();

        // Show results
        setTimeout(() => {
            loadingSection.classList.add('hidden');
            hud.setStatus('IDLE');
            hud.hide(); // Hide HUD when done
            displayResults();
        }, 100);
    };

    // Feed the Engine
    queue.add(fileArray);

    // Start Processing (Wrap to track bytes)
    queue.start(async (file) => {
        const res = await analyzeFile(file);
        totalBytesProcessed += file.size;
        return res;
    });
}




function displayResults() {
    resultsSection.classList.remove('hidden');

    // Calculate statistics
    const totalSize = analysisResults.reduce((sum, f) => sum + f.size, 0);
    const typeStats = {};
    let issues = 0;
    let encryptedCount = 0;

    analysisResults.forEach(f => {
        if (!typeStats[f.type]) {
            typeStats[f.type] = { count: 0, size: 0, category: f.category };
        }
        typeStats[f.type].count++;
        typeStats[f.type].size += f.size;

        if (f.isCorrupt || f.extensionMismatch) issues++;
        if (f.isEncrypted) encryptedCount++;
    });

    // Update summary cards
    document.getElementById('totalFiles').textContent = analysisResults.length;
    document.getElementById('totalSize').textContent = formatFileSize(totalSize);
    document.getElementById('fileTypes').textContent = Object.keys(typeStats).length;
    document.getElementById('issues').textContent = issues;
    document.getElementById('encryptedFiles').textContent = encryptedCount;

    if (issues > 0) {
        document.getElementById('issuesCard').classList.add('warning');
    } else {
        document.getElementById('issuesCard').classList.remove('warning');
    }

    // Render charts
    renderPieChart(typeStats);
    renderBarChart(typeStats);

    // Render table
    renderTable(analysisResults);
}

function renderPieChart(stats) {
    const ctx = document.getElementById('pieChart').getContext('2d');

    if (pieChart) pieChart.destroy();

    const labels = Object.keys(stats);
    const data = labels.map(t => stats[t].count);
    const colors = generateColors(labels.length);

    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim(),
                        padding: 12,
                        usePointStyle: true,
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

function renderBarChart(stats) {
    const ctx = document.getElementById('barChart').getContext('2d');

    if (barChart) barChart.destroy();

    // Group by category
    const categoryStats = {};
    Object.entries(stats).forEach(([type, data]) => {
        if (!categoryStats[data.category]) {
            categoryStats[data.category] = 0;
        }
        categoryStats[data.category] += data.size;
    });

    const labels = Object.keys(categoryStats);
    const data = labels.map(c => categoryStats[c] / (1024 * 1024)); // Convert to MB
    const colors = generateColors(labels.length);

    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
    const gridColor = 'rgba(128, 128, 128, 0.1)';

    barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Size (MB)',
                data: data,
                backgroundColor: colors,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { size: 11 } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { size: 11 } }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function generateColors(count) {
    const baseColors = [
        '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
        '#ec4899', '#f43f5e', '#f97316', '#eab308',
        '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'
    ];

    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
}

function renderTable(files) {
    const search = searchInput.value.toLowerCase();
    const filter = filterSelect.value;

    let filtered = files.filter(f => {
        // Search filter
        if (search && !f.name.toLowerCase().includes(search) &&
            !f.type.toLowerCase().includes(search)) {
            return false;
        }

        // Status filter
        if (filter === 'issues' && !f.isCorrupt && !f.extensionMismatch) return false;
        if (filter === 'mismatch' && !f.extensionMismatch) return false;
        if (filter === 'corrupt' && !f.isCorrupt) return false;
        if (filter === 'encrypted' && !f.isEncrypted) return false;

        return true;
    });

    // Sort by size descending
    filtered.sort((a, b) => b.size - a.size);

    tableBody.innerHTML = filtered.map((f, index) => `
        <tr data-file="${escapeAttr(f.name)}" data-index="${index}" style="animation-delay: ${index * 0.03}s">
            <td>
                <div class="file-name" title="${escapeAttr(f.name)}">${escapeHtml(f.name)}</div>
            </td>
            <td>
                <span class="badge badge-info">${escapeHtml(f.type)}</span>
            </td>
            <td>
                <span class="category-badge">${escapeHtml(f.category)}</span>
            </td>
            <td>${escapeHtml(f.sizeFormatted)}</td>
            <td>
                <div class="entropy-bar">
                    <div class="entropy-fill ${f.entropyLevel.class}" style="width: ${(f.entropy / 8) * 100}%"></div>
                </div>
                <span title="${escapeAttr(f.entropyLevel.description)}">${f.entropy.toFixed(2)}</span>
            </td>
            <td>${getStatusBadge(f)}</td>
            <td>
                <button class="btn btn-secondary btn-view btn-ripple" data-filename="${escapeAttr(f.name)}">
                    🔍 View
                </button>
            </td>
        </tr>
    `).join('');

    // Add click handlers safely (prevents XSS via onclick)
    tableBody.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', () => {
            const filename = btn.getAttribute('data-filename');
            showFileDetails(filename);
        });
    });
}

function getStatusBadge(file) {
    if (file.isCorrupt) {
        return '<span class="badge badge-error">⚠️ Corrupt</span>';
    }
    if (file.extensionMismatch) {
        return '<span class="badge badge-warning">⚠️ Mismatch</span>';
    }
    if (file.isEncrypted) {
        return '<span class="badge badge-info">🔐 Encrypted</span>';
    }
    return '<span class="badge badge-success">✓ Valid</span>';
}

// ============================================
// File Detail Modal
// ============================================

async function showFileDetails(fileName) {
    const file = analysisResults.find(f => f.name === fileName);
    const fileData = currentFileData.get(fileName);

    if (!file) return;

    fileDetailModal.classList.remove('hidden');

    // Basic info
    document.getElementById('fileDetailTitle').textContent = file.name;
    document.getElementById('detailName').textContent = file.name;
    document.getElementById('detailType').textContent = `${file.type} (${file.description})`;
    document.getElementById('detailCategory').textContent = file.category;
    document.getElementById('detailSize').textContent = file.sizeFormatted;
    document.getElementById('detailExtension').textContent = file.actualExtension || 'None';

    // Security info
    document.getElementById('detailHash').textContent = file.hash;
    document.getElementById('detailEntropy').textContent = file.entropy.toFixed(4);
    document.getElementById('detailEntropyLevel').innerHTML = `
        <span class="badge ${file.entropyLevel.class === 'entropy-low' ? 'badge-success' :
            file.entropyLevel.class === 'entropy-medium' ? 'badge-warning' : 'badge-error'}">
            ${file.entropyLevel.level}
        </span> - ${file.entropyLevel.description}
    `;

    // Hex viewer
    if (fileData && fileData.bytes) {
        const previewBytes = fileData.bytes.slice(0, 256);
        const { hex, ascii } = hexToFormattedView(previewBytes);
        document.getElementById('hexContent').textContent = hex;
        document.getElementById('asciiContent').textContent = ascii;
    } else {
        document.getElementById('hexContent').textContent = 'No data available';
        document.getElementById('asciiContent').textContent = '';
    }

    // File preview
    const previewSection = document.getElementById('previewSection');
    const filePreview = document.getElementById('filePreview');

    if (fileData && fileData.file) {
        const mimeType = fileData.file.type;

        if (mimeType.startsWith('image/')) {
            // Image preview
            const url = URL.createObjectURL(fileData.file);
            filePreview.innerHTML = `<img src="${url}" alt="${file.name}" onload="URL.revokeObjectURL(this.src)">`;
            previewSection.classList.remove('hidden');
        } else if (mimeType.startsWith('text/') || file.category === 'Text' || file.category === 'Code' || file.category === 'Web') {
            // Text preview
            try {
                const text = await fileData.file.text();
                const preview = text.substring(0, 2000);
                filePreview.innerHTML = `<div class="text-preview">${escapeHtml(preview)}${text.length > 2000 ? '\n\n... (truncated)' : ''}</div>`;
                previewSection.classList.remove('hidden');
            } catch {
                filePreview.innerHTML = '<p class="no-preview">Could not read file as text</p>';
            }
        } else {
            filePreview.innerHTML = '<p class="no-preview">No preview available for this file type</p>';
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Escape for HTML attributes (prevents XSS in attributes)
function escapeAttr(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ============================================
// History Functions
// ============================================

function saveToHistory() {
    const history = JSON.parse(localStorage.getItem('fileAnalyzerHistory') || '[]');

    const entry = {
        date: new Date().toISOString(),
        filesCount: analysisResults.length,
        totalSize: analysisResults.reduce((sum, f) => sum + f.size, 0),
        issues: analysisResults.filter(f => f.isCorrupt || f.extensionMismatch).length,
        types: [...new Set(analysisResults.map(f => f.type))]
    };

    history.unshift(entry);

    // Keep only last 20 entries
    if (history.length > 20) history.pop();

    localStorage.setItem('fileAnalyzerHistory', JSON.stringify(history));
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('fileAnalyzerHistory') || '[]');

    if (history.length === 0) {
        historyList.innerHTML = '<p class="no-history">No scan history yet</p>';
        return;
    }

    historyList.innerHTML = history.map((entry, i) => {
        const date = new Date(entry.date);
        return `
            <div class="history-item">
                <div class="history-date">📅 ${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
                <div class="history-stats">
                    📁 ${entry.filesCount} files • 
                    💾 ${formatFileSize(entry.totalSize)} • 
                    ${entry.issues > 0 ? `⚠️ ${entry.issues} issues` : '✓ No issues'}
                </div>
                <div style="margin-top: 8px; color: var(--text-muted); font-size: 0.8rem;">
                    Types: ${entry.types.slice(0, 5).join(', ')}${entry.types.length > 5 ? '...' : ''}
                </div>
            </div>
        `;
    }).join('');
}

function clearHistory() {
    localStorage.removeItem('fileAnalyzerHistory');
    loadHistory();
}

// ============================================
// Theme Functions
// ============================================

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);

    // Update charts with new colors
    if (pieChart || barChart) {
        setTimeout(() => {
            const stats = {};
            analysisResults.forEach(f => {
                if (!stats[f.type]) stats[f.type] = { count: 0, size: 0, category: f.category };
                stats[f.type].count++;
                stats[f.type].size += f.size;
            });
            if (pieChart) renderPieChart(stats);
            if (barChart) renderBarChart(stats);
        }, 100);
    }
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-icon');
    icon.textContent = theme === 'dark' ? '🌙' : '☀️';
}

// ============================================
// Export Functions
// ============================================

function exportReport() {
    const report = {
        generatedAt: new Date().toISOString(),
        version: '2.0',
        totalFiles: analysisResults.length,
        totalSize: analysisResults.reduce((sum, f) => sum + f.size, 0),
        totalSizeFormatted: formatFileSize(analysisResults.reduce((sum, f) => sum + f.size, 0)),
        corruptFiles: analysisResults.filter(f => f.isCorrupt).length,
        mismatchedFiles: analysisResults.filter(f => f.extensionMismatch).length,
        encryptedFiles: analysisResults.filter(f => f.isEncrypted).length,
        uniqueTypes: [...new Set(analysisResults.map(f => f.type))].length,
        files: analysisResults.map(f => ({
            name: f.name,
            type: f.type,
            category: f.category,
            description: f.description,
            size: f.size,
            sizeFormatted: f.sizeFormatted,
            extension: f.actualExtension,
            entropy: f.entropy.toFixed(4),
            entropyLevel: f.entropyLevel.level,
            hash: f.hash,
            isCorrupt: f.isCorrupt,
            extensionMismatch: f.extensionMismatch,
            isEncrypted: f.isEncrypted
        }))
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `file-analysis-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// Fix Extensions Function
// ============================================

function showFixExtensions() {
    const mismatched = analysisResults.filter(f => f.extensionMismatch);

    if (mismatched.length === 0) {
        showToast('No extension mismatches to fix!', 'success');
        return;
    }

    const suggestions = mismatched.map(f => {
        const sig = magicDatabase.find(s => s.type === f.type);
        const suggestedExt = sig?.extensions?.[0] || '.unknown';
        const newName = f.name.replace(/\.[^.]+$/, '') + suggestedExt;
        return `• ${f.name} → ${newName}`;
    }).join('\n');

    alert(`Found ${mismatched.length} files with incorrect extensions:\n\n${suggestions}\n\nNote: Automatic renaming requires native file system access. Please rename these files manually.`);
}

// ============================================
// VirusTotal API Integration
// ============================================

// Note: VirusTotal requires an API key for direct queries
// This uses their public hash lookup (no API key needed for known files)
const VIRUSTOTAL_URL = 'https://www.virustotal.com/gui/file/';

async function checkVirusTotal(hash) {
    // Open VirusTotal page for the hash
    // Note: Direct API requires API key, so we use the web interface
    const url = VIRUSTOTAL_URL + hash;
    window.open(url, '_blank');
}

function getVirusTotalLink(hash) {
    if (!hash || hash === 'Calculating...' || hash === 'N/A' || hash === 'Error') {
        return '<span class="text-muted">Hash not available</span>';
    }
    return `<a href="${VIRUSTOTAL_URL}${hash}" target="_blank" class="vt-link">
        🛡️ Check on VirusTotal
    </a>`;
}

// ============================================
// String Extraction (Forensics Feature)
// ============================================

function extractStrings(bytes, minLength = 4) {
    const strings = [];
    let currentString = '';

    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        // Printable ASCII characters (32-126)
        if (byte >= 32 && byte <= 126) {
            currentString += String.fromCharCode(byte);
        } else {
            if (currentString.length >= minLength) {
                strings.push({
                    offset: i - currentString.length,
                    value: currentString
                });
            }
            currentString = '';
        }
    }

    // Don't forget the last string
    if (currentString.length >= minLength) {
        strings.push({
            offset: bytes.length - currentString.length,
            value: currentString
        });
    }

    return strings;
}

function formatStringsOutput(strings, maxStrings = 100) {
    if (strings.length === 0) {
        return '<p class="no-preview">No readable strings found</p>';
    }

    const displayed = strings.slice(0, maxStrings);
    let html = '<div class="strings-list">';

    displayed.forEach(s => {
        const offsetHex = s.offset.toString(16).padStart(8, '0').toUpperCase();
        const escapedValue = escapeHtml(s.value.substring(0, 100));
        html += `<div class="string-item">
            <span class="string-offset">${offsetHex}</span>
            <span class="string-value">${escapedValue}${s.value.length > 100 ? '...' : ''}</span>
        </div>`;
    });

    if (strings.length > maxStrings) {
        html += `<p class="text-muted">... and ${strings.length - maxStrings} more strings</p>`;
    }

    html += '</div>';
    return html;
}

// ============================================
// Enhanced File Details with New Features
// ============================================

async function showFileDetailsEnhanced(fileName) {
    const file = analysisResults.find(f => f.name === fileName);
    const fileData = currentFileData.get(fileName);

    if (!file) return;

    fileDetailModal.classList.remove('hidden');

    // Basic info
    document.getElementById('fileDetailTitle').textContent = file.name;
    document.getElementById('detailName').textContent = file.name;
    document.getElementById('detailType').textContent = `${file.type} (${file.description})`;
    document.getElementById('detailCategory').textContent = file.category;
    document.getElementById('detailSize').textContent = file.sizeFormatted;
    document.getElementById('detailExtension').textContent = file.actualExtension || 'None';

    // Security info with VirusTotal link
    document.getElementById('detailHash').innerHTML = `
        <span class="hash-text">${file.hash}</span>
        <div style="margin-top: 8px;">${getVirusTotalLink(file.hash)}</div>
    `;
    document.getElementById('detailEntropy').textContent = file.entropy.toFixed(4);
    document.getElementById('detailEntropyLevel').innerHTML = `
        <span class="badge ${file.entropyLevel.class === 'entropy-low' ? 'badge-success' :
            file.entropyLevel.class === 'entropy-medium' ? 'badge-warning' : 'badge-error'}">
            ${file.entropyLevel.level}
        </span> - ${file.entropyLevel.description}
    `;

    // Hex viewer
    if (fileData && fileData.bytes) {
        const previewBytes = fileData.bytes.slice(0, 256);
        const { hex, ascii } = hexToFormattedView(previewBytes);
        document.getElementById('hexContent').textContent = hex;
        document.getElementById('asciiContent').textContent = ascii;

        // Extract strings for the strings section
        const strings = extractStrings(fileData.bytes.slice(0, 65536)); // First 64KB
        const stringsSection = document.getElementById('stringsSection');
        const stringsContent = document.getElementById('stringsContent');

        if (stringsSection && stringsContent) {
            stringsContent.innerHTML = formatStringsOutput(strings);
            stringsSection.classList.remove('hidden');
        }
    } else {
        document.getElementById('hexContent').textContent = 'No data available';
        document.getElementById('asciiContent').textContent = '';
    }

    // File preview
    const previewSection = document.getElementById('previewSection');
    const filePreview = document.getElementById('filePreview');

    if (fileData && fileData.file) {
        const mimeType = fileData.file.type;

        if (mimeType.startsWith('image/')) {
            const url = URL.createObjectURL(fileData.file);
            filePreview.innerHTML = `<img src="${url}" alt="${file.name}" onload="URL.revokeObjectURL(this.src)">`;
            previewSection.classList.remove('hidden');
        } else if (mimeType.startsWith('text/') || file.category === 'Text' || file.category === 'Code' || file.category === 'Web') {
            try {
                const text = await fileData.file.text();
                const preview = text.substring(0, 2000);
                filePreview.innerHTML = `<div class="text-preview">${escapeHtml(preview)}${text.length > 2000 ? '\n\n... (truncated)' : ''}</div>`;
                previewSection.classList.remove('hidden');
            } catch {
                filePreview.innerHTML = '<p class="no-preview">Could not read file as text</p>';
            }
        } else if (mimeType.startsWith('audio/')) {
            const url = URL.createObjectURL(fileData.file);
            filePreview.innerHTML = `<audio controls src="${url}" style="width: 100%;"></audio>`;
            previewSection.classList.remove('hidden');
        } else if (mimeType.startsWith('video/')) {
            const url = URL.createObjectURL(fileData.file);
            filePreview.innerHTML = `<video controls src="${url}" style="max-width: 100%; max-height: 300px;"></video>`;
            previewSection.classList.remove('hidden');
        } else {
            filePreview.innerHTML = '<p class="no-preview">No preview available for this file type</p>';
        }
    }
}

// Note: showFileDetails is defined above (line 619) - using enhanced version inline

// ============================================
// Event Listeners
// ============================================

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    console.log('FileTypeAnalyzer Pro v3.0 - Enhanced Edition');
    console.log(`Loaded ${magicDatabase.length} magic signatures`);
});

// Toast Function
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Ripple Effect Handler
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-ripple');
    if (btn) {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;

        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }
});

// ============================================
// DRAG AND DROP HANDLERS - SIMPLE VERSION
// ============================================
// ============================================
// DRAG AND DROP HANDLERS - ROBUST VERSION
// ============================================
console.log('FileTypeAnalyzer: Initializing robust event handlers...');

// 1. GLOBAL PREVENTION (Stop browser from opening files)
window.addEventListener('dragover', function (e) {
    e.preventDefault();
}, false);

window.addEventListener('drop', function (e) {
    e.preventDefault();
}, false);

// 2. DROP ZONE HANDLERS
// Drag enter/over - Visual feedback
function handleDragEnterOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover');
}

dropZone.addEventListener('dragenter', handleDragEnterOver, false);
dropZone.addEventListener('dragover', handleDragEnterOver, false);

// Drag leave - Remove visual feedback
dropZone.addEventListener('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
}, false);

// Drop - Handle files
dropZone.addEventListener('drop', async function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');

    console.log('Drop detected');

    const items = e.dataTransfer.items;
    let allFiles = [];

    if (items && items.length > 0) {
        // Modern API with folder support
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                if (entry) {
                    if (entry.isDirectory) {
                        // It's a directory - scan recursively
                        const dirFiles = await scanDirectory(entry);
                        allFiles = allFiles.concat(dirFiles);
                    } else {
                        // It's a file
                        const file = item.getAsFile();
                        if (file) allFiles.push(file);
                    }
                } else {
                    // Fallback
                    const file = item.getAsFile();
                    if (file) allFiles.push(file);
                }
            }
        }
    } else {
        // Fallback for older browsers
        allFiles = Array.from(e.dataTransfer.files);
    }

    if (allFiles.length > 0) {
        showToast(`Found ${allFiles.length} files`, 'success');
        analyzeFiles(allFiles);
    } else {
        showToast('No files dropped', 'warning');
    }
}, false);

// 3. CLICK TO SELECT
// 3. CLICK TO SELECT
// (Handled natively by <label> in HTML)

// Helper: Recursive Directory Scan
function scanDirectory(entry) {
    return new Promise((resolve) => {
        const reader = entry.createReader();
        const files = [];

        // readEntries must be called recursively until it returns empty
        function readEntries() {
            reader.readEntries(async (entries) => {
                if (entries.length === 0) {
                    resolve(files);
                } else {
                    for (const subEntry of entries) {
                        if (subEntry.isDirectory) {
                            const subFiles = await scanDirectory(subEntry);
                            files.push(...subFiles);
                        } else {
                            // Get file object from entry
                            const file = await new Promise(res => subEntry.file(res));
                            if (file) files.push(file);
                        }
                    }
                    readEntries(); // Continue reading
                }
            }, (err) => {
                console.error('Dir read error:', err);
                resolve(files); // Return what we have so far
            });
        }

        readEntries();
    });
}

// File inputs
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        analyzeFiles(e.target.files);
    }
});

singleFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        analyzeFiles(e.target.files);
    }
});

// Search and filter
searchInput.addEventListener('input', () => renderTable(analysisResults));
filterSelect.addEventListener('change', () => renderTable(analysisResults));

// Buttons
exportBtn.addEventListener('click', exportReport);
fixExtensionsBtn.addEventListener('click', showFixExtensions);

resetBtn.addEventListener('click', () => {
    analysisResults = [];
    currentFileData.clear();
    resultsSection.classList.add('hidden');
    document.querySelector('.drop-section').classList.remove('hidden');
    fileInput.value = '';
    singleFileInput.value = '';
});

// Theme toggle
themeToggle.addEventListener('click', toggleTheme);

// History modal
historyBtn.addEventListener('click', () => {
    loadHistory();
    historyModal.classList.remove('hidden');
});

closeHistory.addEventListener('click', () => {
    historyModal.classList.add('hidden');
});

clearHistoryBtn.addEventListener('click', clearHistory);

// Help modal
helpBtn.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
});

closeModal.addEventListener('click', () => {
    helpModal.classList.add('hidden');
});

// File detail modal
closeFileDetail.addEventListener('click', () => {
    fileDetailModal.classList.add('hidden');
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    }
});

// ============================================
// FILE ORGANIZATION - File System Access API
// ============================================

// Store the directory handle when folder is dropped
let droppedDirectoryHandle = null;

// Check if File System Access API is supported
function isFileSystemAccessSupported() {
    return 'showDirectoryPicker' in window;
}

// Organize files by type
async function organizeFiles() {
    if (analysisResults.length === 0) {
        showToast('No files to organize. Drop a folder first!', 'warning');
        return;
    }

    // Check browser support
    if (!isFileSystemAccessSupported()) {
        showToast('Your browser does not support file organization. Use Chrome or Edge.', 'error');
        alert('File System Access API is not supported in this browser.\n\nPlease use Google Chrome or Microsoft Edge to use this feature.');
        return;
    }

    try {
        // Ask user to select the folder where they want to create Organized_Files
        // showToast('Select the folder where you want to create "Organized_Files"...', 'info'); // Commented out to prevent User Activation loss

        const parentHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'downloads'
        });

        showToast('Creating organized folder structure...', 'info');

        // Create Organized_Files folder
        const organizedFolder = await parentHandle.getDirectoryHandle('Organized_Files', { create: true });

        // Show HUD immediately
        hud.setStatus('ORGANIZING');

        // 1. Group files by detected type 
        const filesByType = {};
        const writeJobs = []; // Flattened list for queue

        analysisResults.forEach(result => {
            let folderName = result.type;

            // Separate ZIP-based formats by their actual extension
            if (result.type.includes('ZIP') || result.type.includes('DOCX') || result.type.includes('XLSX')) {
                const ext = result.actualExtension?.toLowerCase();
                const map = { '.docx': 'DOCX', '.xlsx': 'XLSX', '.pptx': 'PPTX', '.doc': 'DOC', '.xls': 'XLS', '.ppt': 'PPT', '.jar': 'JAR', '.apk': 'APK', '.zip': 'ZIP' };
                folderName = map[ext] || 'ZIP_Archive';
            }
            // Sanitize folder name
            folderName = folderName.replace(/[\/\\:*?"<>|]/g, '_');

            // Populate filesByType for typeCount later
            if (!filesByType[folderName]) {
                filesByType[folderName] = [];
            }
            filesByType[folderName].push(result);

            writeJobs.push({ folderName, fileInfo: result });
        });

        // 2. Pre-calculate Filenames to prevent Race Conditions
        const usedNames = new Map(); // Map<FolderName, Set<FileName>>
        const readyJobs = [];

        writeJobs.forEach(job => {
            const originalFile = currentFileData.get(job.fileInfo.name);
            if (!originalFile || !originalFile.file) return;

            // Initialize set for this folder
            if (!usedNames.has(job.folderName)) usedNames.set(job.folderName, new Set());
            const folderSet = usedNames.get(job.folderName);

            // Sanitization
            let safeName = job.fileInfo.name
                .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
                .replace(/^\.+/, '_')
                .substring(0, 200);

            if (!safeName || safeName.trim() === '') safeName = `unnamed_${Date.now()}`;

            // Handle Duplicates (Synchronously)
            let finalName = safeName;
            let counter = 1;
            while (folderSet.has(finalName.toLowerCase())) {
                const dotIdx = safeName.lastIndexOf('.');
                if (dotIdx > 0) {
                    finalName = `${safeName.substring(0, dotIdx)}_${counter}${safeName.substring(dotIdx)}`;
                } else {
                    finalName = `${safeName}_${counter}`;
                }
                counter++;
            }
            folderSet.add(finalName.toLowerCase());

            readyJobs.push({
                folderName: job.folderName,
                finalName: finalName,
                fileBlob: originalFile.file
            });
        });

        // 3. Initialize Dynamic Queue
        // Write operations are I/O bound. Chrome often throttles > 10 concurrent writes.
        // We use safe concurrency of 64 (Ultrasonic). 
        const queue = new DynamicTaskQueue(64);

        // Cache for Directory Handles
        const dirHandles = new Map();

        // Stats
        const startTime = performance.now();
        let totalBytesWritten = 0;

        // High-Performance UI Loop (RAF)
        let lastFrame = 0;

        queue.onProgress = (stats) => {
            // UI Updates - Using HUD instead of Toasts for Speed
            // We throttle visuals to Screen Refresh Rate (RAF) to save CPU
            const now = performance.now();
            if (now - lastFrame >= 16 || stats.completed === stats.total) {
                lastFrame = now;
                hud.setStatus(`ORGANIZING (${stats.completed}/${stats.total})`);
            }

            const elapsedSeconds = (performance.now() - startTime) / 1000;
            let mbPerSec = 0;
            if (elapsedSeconds > 0) {
                const mbProcessed = totalBytesWritten / (1024 * 1024);
                mbPerSec = (mbProcessed / elapsedSeconds).toFixed(1);
            }

            // Calculate ETA (Average * Remaining / Concurrency)
            const remainingTasks = stats.total - stats.completed;
            const active = Math.max(1, stats.active);
            // AvgTime per task is sum of all task times / count.
            // If we have N active, we process N tasks in avgTime.
            // Wait, avgTime is "duration of one task".
            // So throughput is N / avgTime tasks per ms.
            // Remaining time = RemainingTasks / (N / avgTime) = RemainingTasks * avgTime / N.
            const etaSeconds = (stats.avgTime * remainingTasks) / 1000 / active;

            hud.updateStats({
                mbPerSec: mbPerSec,
                activeThreads: 0, // No CPU usage for write
                etaSeconds: etaSeconds
            });

            // Animate Thread Block (Simulate Disk Activity)
            if (stats.active > 0) {
                const dummyThreads = Math.ceil(Math.random() * 4);
                if (document.getElementById('hudCpu')) document.getElementById('hudCpu').textContent = "Writing...";
                const blocks = document.querySelectorAll('.thread-block');
                blocks.forEach((b, i) => i < dummyThreads ? b.classList.add('active') : b.classList.remove('active'));
            }
        };

        queue.onComplete = () => {
            hud.updateStats({ activeThreads: 0 });
            showToast('✨ All files organized successfully!', 'success');

            const typeCount = Object.keys(filesByType).length;
            alert(`Success! Organized ${readyJobs.length} files into ${typeCount} folders.\nCheck the "Organized_Files" folder.`);

            // Reset HUD
            setTimeout(() => {
                hud.setStatus('IDLE');
                hud.hide();
            }, 2000);
        };

        queue.add(readyJobs);

        queue.start(async (job) => {
            // Get or Create Folder Handle
            let typeFolder = dirHandles.get(job.folderName);
            if (!typeFolder) {
                typeFolder = await organizedFolder.getDirectoryHandle(job.folderName, { create: true });
                dirHandles.set(job.folderName, typeFolder);
            }

            // Serialize Write (Create Writable -> Write -> Close)
            const newFileHandle = await typeFolder.getFileHandle(job.finalName, { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(job.fileBlob);
            await writable.close();

            totalBytesWritten += job.fileBlob.size;
            return job.finalName;
        });

    } catch (err) {
        if (err.name === 'AbortError') {
            showToast('Folder selection cancelled', 'warning');
        } else {
            console.error('Organization error:', err);
            showToast('Error organizing files: ' + err.message, 'error');
        }
    }
}

// Add organize button event listener
const organizeBtn = document.getElementById('organizeBtn');
if (organizeBtn) {
    organizeBtn.addEventListener('click', organizeFiles);
}

console.log('FileTypeAnalyzer Pro loaded with File Organization feature!');
