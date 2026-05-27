const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { Readable } = require('stream');

const GITHUB_OWNER = 'althericoffcv';
const GITHUB_REPO = 'bf-uploader-db';
const GITHUB_FOLDER = 'bf-uploader/image';
const BASE_URL = 'https://api.lumi-base.my.id/imgurl';

function getToken() {
    return process.env.GBTOKEN;
}

function getExtension(filename, mimeType) {
    if (filename && filename.includes('.')) {
        return filename.split('.').pop().split('?')[0].toLowerCase();
    }
    const mimeMap = {
        'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
        'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
        'video/mp4': 'mp4', 'video/webm': 'webm', 'video/avi': 'avi',
        'video/mov': 'mov', 'video/quicktime': 'mov', 'video/mkv': 'mkv',
        'application/pdf': 'pdf', 'text/plain': 'txt',
        'application/zip': 'zip', 'application/octet-stream': 'bin'
    };
    return mimeMap[mimeType] || 'bin';
}

function generateFilename(ext) {
    const ts = Date.now();
    const rand = crypto.randomBytes(4).toString('hex');
    return `lumi_${ts}_${rand}.${ext}`;
}

// Ambil SHA file yang sudah ada di GitHub (kalau belum ada return null)
function getFileSha(filePath) {
    return new Promise((resolve) => {
        const token = getToken();
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${token}`,
                'User-Agent': 'lumi-base-uploader',
                'Accept': 'application/vnd.github.v3+json'
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data).sha || null); }
                catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

// Upload file ke GitHub via API
function uploadToGithub(filename, base64Content) {
    return new Promise(async (resolve, reject) => {
        const token = getToken();
        if (!token) return reject(new Error('GBTOKEN tidak ditemukan di environment'));

        const filePath = `${GITHUB_FOLDER}/${filename}`;
        const apiPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

        // Cek SHA kalau file sudah ada (butuh sha untuk overwrite)
        const existingSha = await getFileSha(filePath);

        const bodyObj = { message: `upload: ${filename}`, content: base64Content };
        if (existingSha) bodyObj.sha = existingSha;

        const body = JSON.stringify(bodyObj);

        const options = {
            hostname: 'api.github.com',
            path: apiPath,
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'User-Agent': 'lumi-base-uploader',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode === 201 || res.statusCode === 200) {
                    resolve(`${BASE_URL}/${filename}`);
                } else {
                    try {
                        const json = JSON.parse(data);
                        const detail = json.message || data.slice(0, 200);
                        if (res.statusCode === 404) {
                            reject(new Error(`GitHub 404: Repo "${GITHUB_OWNER}/${GITHUB_REPO}" atau folder "${GITHUB_FOLDER}" tidak ditemukan. Pastikan repo & folder sudah dibuat.`));
                        } else if (res.statusCode === 401) {
                            reject(new Error(`GitHub 401: Token tidak valid atau expired. Cek env GBTOKEN.`));
                        } else if (res.statusCode === 403) {
                            reject(new Error(`GitHub 403: Token tidak punya scope "repo". Detail: ${detail}`));
                        } else if (res.statusCode === 422) {
                            reject(new Error(`GitHub 422: File conflict. Detail: ${detail}`));
                        } else {
                            reject(new Error(`GitHub error ${res.statusCode}: ${detail}`));
                        }
                    } catch {
                        reject(new Error(`GitHub error ${res.statusCode}: ${data.slice(0, 200)}`));
                    }
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// Download file dari URL, return base64 + mime
function fetchFromUrl(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {
            // Follow redirect
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchFromUrl(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Gagal fetch URL: HTTP ${res.statusCode}`));
            }

            const mimeType = res.headers['content-type']?.split(';')[0] || 'application/octet-stream';
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve({ buffer, mimeType });
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout fetch URL')); });
    });
}

// Parse multipart form-data manual (tanpa library)
function parseMultipart(body, boundary) {
    const files = [];
    const boundaryBuf = Buffer.from(`--${boundary}`);
    const parts = [];

    let start = 0;
    while (start < body.length) {
        const boundaryIdx = body.indexOf(boundaryBuf, start);
        if (boundaryIdx === -1) break;

        const nextStart = boundaryIdx + boundaryBuf.length;
        if (body.slice(nextStart, nextStart + 2).toString() === '--') break;

        const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), nextStart);
        if (headerEnd === -1) { start = nextStart; continue; }

        const headerStr = body.slice(nextStart + 2, headerEnd).toString();
        const contentStart = headerEnd + 4;
        const nextBoundary = body.indexOf(boundaryBuf, contentStart);
        const contentEnd = nextBoundary !== -1 ? nextBoundary - 2 : body.length;
        const content = body.slice(contentStart, contentEnd);

        const nameMatch = headerStr.match(/name="([^"]+)"/);
        const filenameMatch = headerStr.match(/filename="([^"]+)"/);
        const mimeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

        if (filenameMatch) {
            files.push({
                fieldname: nameMatch?.[1] || 'file',
                filename: filenameMatch[1],
                mimeType: mimeMatch?.[1]?.trim() || 'application/octet-stream',
                buffer: content
            });
        }

        start = nextBoundary !== -1 ? nextBoundary : body.length;
    }

    return files;
}

module.exports = function(app) {

    app.get('/imgurl/:filename', async (req, res) => {
        const { filename } = req.params;
        const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${GITHUB_FOLDER}/${filename}`;

        try {
            const { buffer, mimeType } = await fetchFromUrl(rawUrl);
            res.set('Content-Type', mimeType);
            res.set('Content-Disposition', `inline; filename="${filename}"`);
            res.set('Cache-Control', 'public, max-age=86400');
            res.send(buffer);
        } catch (err) {
            res.status(404).json({ status: false, message: `File tidak ditemukan: ${filename}` });
        }
    });

    app.post('/cloud/lumiuploader', async (req, res) => {
        try {
            const results = [];
            const errors = [];
            const contentType = req.headers['content-type'] || '';

            if (contentType.includes('multipart/form-data')) {
                const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
                if (!boundaryMatch) return res.status(400).json({ status: false, message: 'Boundary tidak ditemukan' });

                const boundary = boundaryMatch[1];
                const bodyChunks = [];
                req.on('data', c => bodyChunks.push(c));
                await new Promise(r => req.on('end', r));
                const bodyBuffer = Buffer.concat(bodyChunks);

                const files = parseMultipart(bodyBuffer, boundary);
                if (files.length === 0) return res.status(400).json({ status: false, message: 'Tidak ada file ditemukan di form-data' });

                for (const file of files) {
                    try {
                        const ext = getExtension(file.filename, file.mimeType);
                        const filename = generateFilename(ext);
                        const b64 = file.buffer.toString('base64');
                        const url = await uploadToGithub(filename, b64);
                        results.push({ original: file.filename, url, size: file.buffer.length });
                    } catch (e) {
                        errors.push({ original: file.filename, error: e.message });
                    }
                }
            }

            else if (contentType.includes('application/json')) {
                const body = req.body;

                // Dari URL
                if (body.urls && Array.isArray(body.urls)) {
                    for (const url of body.urls) {
                        try {
                            const { buffer, mimeType } = await fetchFromUrl(url);
                            const urlPath = url.split('?')[0];
                            const originalName = urlPath.split('/').pop() || 'file';
                            const ext = getExtension(originalName, mimeType);
                            const filename = generateFilename(ext);
                            const b64 = buffer.toString('base64');
                            const resultUrl = await uploadToGithub(filename, b64);
                            results.push({ original: url, url: resultUrl, size: buffer.length });
                        } catch (e) {
                            errors.push({ original: url, error: e.message });
                        }
                    }
                }

                if (body.url && typeof body.url === 'string') {
                    try {
                        const { buffer, mimeType } = await fetchFromUrl(body.url);
                        const urlPath = body.url.split('?')[0];
                        const originalName = urlPath.split('/').pop() || 'file';
                        const ext = getExtension(originalName, mimeType);
                        const filename = generateFilename(ext);
                        const b64 = buffer.toString('base64');
                        const resultUrl = await uploadToGithub(filename, b64);
                        results.push({ original: body.url, url: resultUrl, size: buffer.length });
                    } catch (e) {
                        errors.push({ original: body.url, error: e.message });
                    }
                }

                if (body.files && Array.isArray(body.files)) {
                    for (const file of body.files) {
                        try {
                            if (!file.base64) throw new Error('Field base64 tidak ada');
                            const ext = getExtension(file.filename || '', file.mimeType || '');
                            const filename = generateFilename(ext || 'bin');
                            // Strip data URI prefix kalau ada
                            const cleanB64 = file.base64.replace(/^data:[^;]+;base64,/, '');
                            const resultUrl = await uploadToGithub(filename, cleanB64);
                            const size = Buffer.from(cleanB64, 'base64').length;
                            results.push({ original: file.filename || 'base64', url: resultUrl, size });
                        } catch (e) {
                            errors.push({ original: file.filename || 'base64', error: e.message });
                        }
                    }
                }

                if (body.base64 && typeof body.base64 === 'string') {
                    try {
                        const ext = getExtension(body.filename || '', body.mimeType || '');
                        const filename = generateFilename(ext || 'bin');
                        const cleanB64 = body.base64.replace(/^data:[^;]+;base64,/, '');
                        const resultUrl = await uploadToGithub(filename, cleanB64);
                        const size = Buffer.from(cleanB64, 'base64').length;
                        results.push({ original: body.filename || 'base64', url: resultUrl, size });
                    } catch (e) {
                        errors.push({ original: body.filename || 'base64', error: e.message });
                    }
                }

                if (results.length === 0 && errors.length === 0) {
                    return res.status(400).json({
                        status: false,
                        message: 'Body harus berisi: url, urls[], base64, atau files[]'
                    });
                }
            }

            else {
                return res.status(400).json({
                    status: false,
                    message: 'Content-Type harus multipart/form-data atau application/json'
                });
            }

            if (results.length === 0 && errors.length > 0) {
                return res.status(500).json({ status: false, errors });
            }

            return res.json({
                status: true,
                uploaded: results.length,
                failed: errors.length,
                results,
                ...(errors.length > 0 ? { errors } : {})
            });

        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });
};
