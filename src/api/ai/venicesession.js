const https = require('https');
const crypto = require('crypto');

// ── Venice auth session cache (shared, 1 jam) ─────────────────────────────
let veniceAuth = { cookie: null, distinctId: null, expiry: 0 };

function generateVeniceAuth() {
    const distinctId = crypto.randomUUID();
    const deviceId   = crypto.randomUUID();
    const sessionId  = crypto.randomUUID();
    const now = Date.now();

    const posthogData = encodeURIComponent(JSON.stringify({
        distinct_id: distinctId,
        '$device_id': deviceId,
        '$sesid': [now, sessionId, now],
        '$epp': true,
        '$initial_person_info': { r: '$direct', u: 'https://venice.ai/' }
    }));

    const cookie = [
        'venice-chat-version=v2',
        '_client_uat=0',
        '__client_uat_aKq7rGhf=0',
        `ph_phc_4Yg9V0hm9Lgavwcr6LZACe64tya7UqfyHePVNOzYREF_posthog=${posthogData}`
    ].join('; ');

    return { cookie, distinctId };
}

function getVeniceAuth() {
    if (veniceAuth.cookie && Date.now() < veniceAuth.expiry) return veniceAuth;
    const { cookie, distinctId } = generateVeniceAuth();
    veniceAuth = { cookie, distinctId, expiry: Date.now() + 60 * 60 * 1000 };
    console.log('[venice-session] New auth generated:', distinctId);
    return veniceAuth;
}

// ── In-memory session store ──────────────────────────────────────────────
// Map: sessionId → { messages: [{role,text}], createdAt, lastUsed }
const sessionStore = new Map();

const SESSION_TTL   = 60 * 60 * 1000;  // 1 jam idle → expired
const MAX_SESSIONS  = 500;              // max session di memory
const MAX_HISTORY   = 40;              // max message per session (20 turn)

function pruneExpired() {
    const now = Date.now();
    for (const [id, s] of sessionStore) {
        if (now - s.lastUsed > SESSION_TTL) sessionStore.delete(id);
    }
}

function createSession() {
    pruneExpired();
    if (sessionStore.size >= MAX_SESSIONS) {
        // Hapus yang paling lama idle
        let oldestId = null, oldestTime = Infinity;
        for (const [id, s] of sessionStore) {
            if (s.lastUsed < oldestTime) { oldestTime = s.lastUsed; oldestId = id; }
        }
        if (oldestId) sessionStore.delete(oldestId);
    }

    const id = crypto.randomBytes(12).toString('hex');
    sessionStore.set(id, {
        messages: [],
        createdAt: Date.now(),
        lastUsed: Date.now()
    });
    return id;
}

function getSessionData(id) {
    const s = sessionStore.get(id);
    if (!s) return null;
    if (Date.now() - s.lastUsed > SESSION_TTL) {
        sessionStore.delete(id);
        return null;
    }
    s.lastUsed = Date.now();
    return s;
}

// ── Build Venice payload dari history ─────────────────────────────────────
function buildPayload(messages) {
    // messages = [{role:'user'|'assistant', text:'...'}]
    const veniceMessages = messages.map(m => {
        const msgId = crypto.randomBytes(9).toString('base64url').slice(0, 14);
        return {
            content: [{ annotations: [], text: m.text, type: 'output_text' }],
            id: msgId,
            role: m.role,
            status: 'completed',
            type: 'message'
        };
    });

    return JSON.stringify({ input: { messages: veniceMessages } });
}

// ── Call Venice API ────────────────────────────────────────────────────────
function askVeniceWithHistory(messages, cookie, distinctId) {
    return new Promise((resolve, reject) => {
        const payload = buildPayload(messages);

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
                veniceAuth.expiry = 0;
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
                if (responseText !== null) resolve({ text: responseText, tokens });
                else {
                    veniceAuth.expiry = 0;
                    reject(new Error('Tidak ada respons dari Venice AI'));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ── Routes ─────────────────────────────────────────────────────────────────
module.exports = function(app) {

    // POST /ai/venice/session/new
    // Buat session baru, return session_id
    app.post('/ai/venice/session/new', (req, res) => {
        const id = createSession();
        res.json({
            status: true,
            message: 'Session berhasil dibuat. Kirim pesan via POST /ai/venice/session/chat',
            session_id: id,
            expires_in: '1 jam sejak pesan terakhir',
            max_history: MAX_HISTORY
        });
    });

    // POST /ai/venice/session/chat
    // Body: { session_id, text }
    // Kirim pesan, terima balasan, history tersimpan
    app.post('/ai/venice/session/chat', async (req, res) => {
        const { session_id, text } = req.body || {};

        if (!session_id || typeof session_id !== 'string') {
            return res.status(400).json({
                status: false,
                message: "Field 'session_id' wajib diisi. Buat session dulu via POST /ai/venice/session/new"
            });
        }
        if (!text || !text.trim()) {
            return res.status(400).json({
                status: false,
                message: "Field 'text' wajib diisi."
            });
        }

        const session = getSessionData(session_id);
        if (!session) {
            return res.status(404).json({
                status: false,
                message: 'Session tidak ditemukan atau sudah expired. Buat session baru via POST /ai/venice/session/new',
                session_id
            });
        }

        // Tambah pesan user ke history
        session.messages.push({ role: 'user', text: text.trim() });

        // Trim kalau history terlalu panjang (jaga agar tetap even: user+assistant pairs)
        while (session.messages.length > MAX_HISTORY) {
            session.messages.splice(0, 2); // hapus pair terlama
        }

        try {
            const auth = getVeniceAuth();
            const result = await askVeniceWithHistory(session.messages, auth.cookie, auth.distinctId);

            // Simpan balasan ke history
            session.messages.push({ role: 'assistant', text: result.text });

            res.json({
                status: true,
                category: 'Artificial Intelligence',
                session_id,
                turn: Math.floor(session.messages.length / 2),
                data: {
                    author: 'Venice AI',
                    model: 'Kimi K2.5',
                    tokens: result.tokens || null,
                    response: result.text
                }
            });
        } catch (err) {
            // Rollback user message kalau error
            session.messages.pop();
            res.status(500).json({ status: false, message: err.message });
        }
    });

    // GET /ai/venice/session/history?session_id=xxx
    // Lihat history percakapan
    app.get('/ai/venice/session/history', (req, res) => {
        const { session_id } = req.query;

        if (!session_id) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'session_id' wajib diisi."
            });
        }

        const session = getSessionData(session_id);
        if (!session) {
            return res.status(404).json({
                status: false,
                message: 'Session tidak ditemukan atau sudah expired.',
                session_id
            });
        }

        res.json({
            status: true,
            session_id,
            turn: Math.floor(session.messages.length / 2),
            created_at: new Date(session.createdAt).toISOString(),
            history: session.messages.map((m, i) => ({
                index: i + 1,
                role: m.role,
                text: m.text
            }))
        });
    });

    // DELETE /ai/venice/session/clear
    // Body: { session_id }  → hapus session / reset history
    app.delete('/ai/venice/session/clear', (req, res) => {
        const { session_id } = req.body || req.query || {};

        if (!session_id) {
            return res.status(400).json({
                status: false,
                message: "Field 'session_id' wajib diisi."
            });
        }

        const exists = sessionStore.has(session_id);
        sessionStore.delete(session_id);

        res.json({
            status: true,
            message: exists ? 'Session berhasil dihapus.' : 'Session tidak ditemukan (mungkin sudah expired).',
            session_id
        });
    });
};
