const https = require('https');
const crypto = require('crypto');

let sessionCache = {
    cookie: null,
    distinctId: null,
    expiry: 0
};

function generateSession() {
    const distinctId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const now = Date.now();

    const posthogData = encodeURIComponent(JSON.stringify({
        distinct_id: distinctId,
        '$device_id': deviceId,
        '$sesid': [now, sessionId, now],
        '$epp': true,
        '$initial_person_info': { r: '$direct', u: 'https://venice.ai/' }
    }));

    const cookie = [
        `venice-chat-version=v2`,
        `_client_uat=0`,
        `__client_uat_aKq7rGhf=0`,
        `ph_phc_4Yg9V0hm9Lgavwcr6LZACe64tya7UqfyHePVNOzYREF_posthog=${posthogData}`
    ].join('; ');

    return { cookie, distinctId };
}

function getSession() {
    if (sessionCache.cookie && Date.now() < sessionCache.expiry) {
        return sessionCache;
    }
    const { cookie, distinctId } = generateSession();
    sessionCache = {
        cookie,
        distinctId,
        expiry: Date.now() + 60 * 60 * 1000
    };
    return sessionCache;
}

function makeId(len = 14) {
    return crypto.randomBytes(len).toString('base64url').slice(0, len);
}

function generateImage(prompt, cookie, distinctId) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            input: {
                messages: [
                    {
                        content: [{
                            annotations: [],
                            text: `generate image: ${prompt}`,
                            type: 'output_text'
                        }],
                        id: makeId(),
                        role: 'user',
                        status: 'completed',
                        type: 'message'
                    }
                ]
            }
        });

        const options = {
            hostname: 'outerface.venice.ai',
            path: '/api/inference/workflow/chat',
            method: 'POST',
            headers: {
                'Accept': 'text/event-stream',
                'Accept-Encoding': 'identity',
                'Accept-Language': 'en-US,en;q=0.9',
                'Content-Length': Buffer.byteLength(payload),
                'Content-Type': 'application/json',
                'Origin': 'https://venice.ai',
                'Referer': 'https://venice.ai/',
                'Sec-Ch-Ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
                'Sec-Ch-Ua-Mobile': '?1',
                'Sec-Ch-Ua-Platform': '"Android"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
                'X-Venice-Distinct-Id': distinctId,
                'X-Venice-Locale': 'en',
                'X-Venice-Middleface-Version': '0.1.763',
                'X-Venice-Request-Timestamp': Date.now().toString(),
                'Cookie': cookie
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode === 401 || res.statusCode === 403) {
                sessionCache.expiry = 0;
                let b = '';
                res.on('data', c => b += c);
                res.on('end', () => reject(new Error(`Auth error (${res.statusCode}), coba lagi`)));
                return;
            }

            if (res.statusCode !== 200) {
                let b = '';
                res.on('data', c => b += c);
                res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${b.slice(0, 200)}`)));
                return;
            }

            let buffer = '';
            let imageChunks = [];
            let imageFormat = 'png';
            let currentEvent = '';

            res.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        currentEvent = line.slice(6).trim();
                        continue;
                    }

                    if (!line.startsWith('data:')) continue;
                    const data = line.slice(5).trim();
                    if (data === '[DONE]') return;

                    try {
                        const json = JSON.parse(data);

                        if (currentEvent === 'veniceai:image_generation.image_chunk') {
                            if (json?.image_chunk_b64) imageChunks.push(json.image_chunk_b64);
                            if (json?.format) imageFormat = json.format;
                        }
                    } catch (_) {}
                }
            });

            res.on('end', () => {
                if (imageChunks.length > 0) {
                    const fullBase64 = imageChunks.join('');
                    resolve({ base64: fullBase64, format: imageFormat });
                } else {
                    sessionCache.expiry = 0;
                    reject(new Error('Tidak ada image yang dihasilkan'));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

module.exports = function(app) {
    app.get('/ai/veniceimggen', async (req, res) => {
        const { prompt } = req.query;

        if (!prompt || !prompt.trim()) return res.status(400).json({
            status: false,
            message: "Parameter 'prompt' wajib diisi! Contoh: /ai/imagine?prompt=anime girl"
        });

        try {
            const session = getSession();
            const result = await generateImage(prompt.trim(), session.cookie, session.distinctId);

            const imgBuffer = Buffer.from(result.base64, 'base64');
            res.set('Content-Type', `image/${result.format}`);
            res.set('Content-Length', imgBuffer.length);
            res.send(imgBuffer);

        } catch (err) {
            res.status(500).json({
                status: false,
                message: err.message
            });
        }
    });


    app.get('/ai/veniceimggen/base64', async (req, res) => {
        const { prompt } = req.query;

        if (!prompt || !prompt.trim()) return res.status(400).json({
            status: false,
            message: "Parameter 'prompt' wajib diisi!"
        });

        try {
            const session = getSession();
            const result = await generateImage(prompt.trim(), session.cookie, session.distinctId);

            res.json({
                status: true,
                category: 'Artificial Intelligence',
                query: prompt.trim(),
                data: {
                    format: result.format,
                    base64: result.base64
                }
            });

        } catch (err) {
            res.status(500).json({
                status: false,
                message: err.message
            });
        }
    });
};
