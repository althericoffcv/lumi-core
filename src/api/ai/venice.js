const https = require('https');
const crypto = require('crypto');

// Cache session 1 jam
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
        expiry: Date.now() + 60 * 60 * 1000 // 1 jam
    };
    console.log('[venice] New session generated:', distinctId);
    return sessionCache;
}

function makePayload(text) {
    const msgId = crypto.randomBytes(9).toString('base64url').slice(0, 14);
    return JSON.stringify({
        input: {
            messages: [
                {
                    content: [{ annotations: [], text, type: 'output_text' }],
                    id: msgId,
                    role: 'user',
                    status: 'completed',
                    type: 'message'
                }
            ]
        }
    });
}

function askVenice(text, cookie, distinctId) {
    return new Promise((resolve, reject) => {
        const payload = makePayload(text);

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
                'X-Venice-Middleface-Version': '0.1.762',
                'X-Venice-Request-Timestamp': Date.now().toString(),
                'Cookie': cookie
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode === 401 || res.statusCode === 403) {
                sessionCache.expiry = 0; // force regenerate next request
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
            let responseText = null;
            let tokens = null;

            res.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;
                    const data = line.slice(5).trim();
                    if (data === '[DONE]') return;
                    try {
                        const json = JSON.parse(data);
                        // output_index 0 = reasoning (skip), output_index 1 = actual response
                        if (json.output_index === 1 && json.text !== undefined) {
                            responseText = json.text;
                            if (json.context_metadata?.total_tokens) {
                                tokens = json.context_metadata.total_tokens;
                            }
                        }
                    } catch (_) {}
                }
            });

            res.on('end', () => {
                if (responseText !== null) {
                    resolve({ text: responseText, tokens });
                } else {
                    sessionCache.expiry = 0;
                    reject(new Error('Tidak ada respons dari Venice AI'));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

module.exports = function(app) {
    app.get('/ai/venice', async (req, res) => {
        const { text } = req.query;

        if (!text || !text.trim()) return res.status(400).json({
            status: false,
            message: "Parameter 'text' wajib diisi! Contoh: /ai/venice?text=halo siapa kamu"
        });

        try {
            const session = getSession(); // sync, no await needed
            const result = await askVenice(text.trim(), session.cookie, session.distinctId);

            res.json({
                status: true,
                category: 'Artificial Intelligence',
                query: text.trim(),
                data: {
                    author: 'Venice AI',
                    model: 'Kimi K2.5',
                    tokens: result.tokens || null,
                    response: result.text
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
