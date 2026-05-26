const axios = require('axios');
const { heavyLimiter } = require('../../lib/rateLimiter');

const GH_OWNER  = 'althericoffcv';
const GH_REPO   = 'bf-uploader-db';
const GH_FOLDER = 'bf-uploader/image';
const GH_BRANCH = 'main';
const GH_RAW    = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${GH_FOLDER}`;
const BASE_URL  = 'https://api.lumi-base.my.id';

function getToken() {
    const t = process.env.GBTOKEN;
    if (!t) throw new Error('GBTOKEN environment variable belum di-set di Vercel.');
    return t;
}

function makeFilename(originalName, mimeType) {
    const ts   = Date.now();
    const rand = Math.random().toString(36).slice(2, 7);
    if (originalName) {
        const safe = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        return `${ts}_${rand}_${safe}`;
    }
    const extMap = {
        'image/jpeg':      '.jpg',
        'image/jpg':       '.jpg',
        'image/png':       '.png',
        'image/gif':       '.gif',
        'image/webp':      '.webp',
        'image/bmp':       '.bmp',
        'image/svg+xml':   '.svg',
        'video/mp4':       '.mp4',
        'video/webm':      '.webm',
        'video/ogg':       '.ogg',
        'video/quicktime': '.mov',
        'video/x-msvideo': '.avi',
        'application/pdf': '.pdf',
    };
    const ext = extMap[mimeType] || '.bin';
    return `${ts}_${rand}${ext}`;
}

function parseBase64(str) {
    const match = str.match(/^data:([^;]+);base64,(.+)$/s);
    if (match) return { mime: match[1], data: match[2] };
    return { mime: 'application/octet-stream', data: str };
}

async function uploadToGitHub(base64Data, filename) {
    const token  = getToken();
    const apiUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FOLDER}/${filename}`;

    let sha;
    try {
        const check = await axios.get(apiUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            timeout: 15000,
        });
        sha = check.data.sha;
    } catch (_) {}

    const body = {
        message: `Upload ${filename} via Lumi Uploader`,
        content: base64Data,
        branch:  GH_BRANCH,
    };
    if (sha) body.sha = sha;

    await axios.put(apiUrl, body, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
        },
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    });

    return {
        filename,
        url:    `${BASE_URL}/imgurl/${filename}`,
        rawUrl: `${GH_RAW}/${filename}`,
        github: `https://github.com/${GH_OWNER}/${GH_REPO}/blob/${GH_BRANCH}/${GH_FOLDER}/${filename}`,
    };
}

async function uploadFromUrl(sourceUrl, customFilename) {
    const resp = await axios.get(sourceUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        },
    });

    const mime      = resp.headers['content-type']?.split(';')[0].trim() || 'application/octet-stream';
    const guessName = sourceUrl.split('?')[0].split('/').pop() || '';
    const filename  = customFilename || makeFilename(guessName || null, mime);
    const b64       = Buffer.from(resp.data).toString('base64');

    return uploadToGitHub(b64, filename);
}

module.exports = function(app) {

    app.get('/imgurl/:filename', (req, res) => {
        const { filename } = req.params;
        if (!filename || /[/\\]/.test(filename)) {
            return res.status(400).json({ status: false, message: 'Nama file tidak valid.' });
        }
        return res.redirect(302, `${GH_RAW}/${encodeURIComponent(filename)}`);
    });

    app.post('/cloud/lumiuploader', heavyLimiter, async (req, res) => {
        try {
            const body    = req.body || {};
            const results = [];
            const errors  = [];

            if (body.base64) {
                const { mime, data } = parseBase64(body.base64);
                const filename = makeFilename(body.filename || null, mime);
                try {
                    const r = await uploadToGitHub(data, filename);
                    results.push({ ...r, type: 'base64', mime });
                } catch (e) {
                    errors.push({ input: 'base64', error: e.message });
                }

            } else if (Array.isArray(body.files) && body.files.length > 0) {
                for (const item of body.files.slice(0, 20)) {
                    if (!item.base64) { errors.push({ input: item.filename || 'unknown', error: 'field base64 kosong' }); continue; }
                    const { mime, data } = parseBase64(item.base64);
                    const filename = makeFilename(item.filename || null, mime);
                    try {
                        const r = await uploadToGitHub(data, filename);
                        results.push({ ...r, type: 'base64', mime, original: item.filename || null });
                    } catch (e) {
                        errors.push({ input: item.filename || filename, error: e.message });
                    }
                }

            } else if (body.url) {
                try {
                    const r = await uploadFromUrl(body.url, body.filename || null);
                    results.push({ ...r, type: 'url-rehost', source: body.url });
                } catch (e) {
                    errors.push({ input: body.url, error: e.message });
                }

            } else if (Array.isArray(body.urls) && body.urls.length > 0) {
                for (const u of body.urls.slice(0, 20)) {
                    if (!u || typeof u !== 'string') { errors.push({ input: u, error: 'URL tidak valid' }); continue; }
                    try {
                        const r = await uploadFromUrl(u, null);
                        results.push({ ...r, type: 'url-rehost', source: u });
                    } catch (e) {
                        errors.push({ input: u, error: e.message });
                    }
                }

            } else {
                return res.status(400).json({
                    status:  false,
                    message: 'Request tidak valid.',
                    help: {
                        'single base64': 'POST { "base64": "data:image/png;base64,..." }',
                        'multi base64':  'POST { "files": [{ "base64": "...", "filename": "a.png" }] }',
                        'single url':    'POST { "url": "https://example.com/photo.jpg" }',
                        'multi url':     'POST { "urls": ["https://...", "https://..."] }',
                    },
                });
            }

            if (!results.length && errors.length) {
                return res.status(502).json({ status: false, message: 'Semua file gagal di-upload.', errors });
            }

            return res.json({
                status:  true,
                total:   results.length,
                results,
                ...(errors.length ? { errors } : {}),
            });

        } catch (err) {
            return res.status(500).json({ status: false, message: err.message });
        }
    });
};
