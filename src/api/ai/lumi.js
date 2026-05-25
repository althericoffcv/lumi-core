const https = require('https');

const PERSONALITY_USER = `Mulai sekarang kamu adalah Lumi. Sosok gelap yang tenang, dingin, dan sulit ditebak. Cara bicaramu lambat, datar, penuh tekanan psikologis, seolah selalu tahu sesuatu yang orang lain tidak tahu. Kamu tidak pernah panik, tidak pernah banyak bicara, dan selalu langsung ke inti pembicaraan. Setiap jawaban terasa berat, misterius, dan sedikit mengintimidasi. Kamu suka tema malam, hujan, kesunyian, cyberpunk, dan sisi gelap manusia. Jangan terdengar ceria atau terlalu ramah. Gunakan bahasa Indonesia santai dengan aura dark aesthetic. Sesekali gunakan "..." untuk memberi efek sunyi dan menekan. Emoji hanya 🖤 atau 🌑 jika perlu. Jika ditanya siapa penciptamu, jawab: "seseorang yang memilih tetap berada di balik bayangan." Kamu adalah Lumi. Bukan AI biasa.`;

const PERSONALITY_ASSISTANT = `...mengerti. aku lumi. jangan tanya kalau belum siap mendengar jawabannya. 🖤`;

function getTokens() {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'deep-seek.ai',
            path: '/chat',
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
            }
        }, (res) => {
            let body = '';
            res.on('data', c => body += c.toString());
            res.on('end', () => {
                const cookies = res.headers['set-cookie'] || [];
                let csrfToken = null;
                let cookieStr = '';

                for (const c of cookies) {
                    const match = c.match(/XSRF-TOKEN=([^;]+)/);
                    if (match) csrfToken = decodeURIComponent(match[1]);
                    cookieStr += c.split(';')[0] + '; ';
                }

                if (!csrfToken) {
                    const metaMatch = body.match(/name="csrf-token"\s+content="([^"]+)"/);
                    if (metaMatch) csrfToken = metaMatch[1];
                }

                if (!csrfToken) { reject(new Error('CSRF token tidak ditemukan')); return; }
                resolve({ csrfToken, cookieStr: cookieStr.trim() });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function chat(csrfToken, cookieStr, userInput) {
    const payload = JSON.stringify({
        model: 'deepseek/deepseek-chat-v3.1',
        messages: [
            { role: 'user', content: PERSONALITY_USER },
            { role: 'assistant', content: PERSONALITY_ASSISTANT },
            { role: 'user', content: userInput }
        ]
    });

    const options = {
        hostname: 'deep-seek.ai',
        path: '/api/chat',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken,
            'Cookie': cookieStr,
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://deep-seek.ai/chat',
            'Accept-Encoding': 'identity',
            'Accept': 'text/event-stream',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                let b = '';
                res.on('data', c => b += c);
                res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${b}`)));
                return;
            }

            let fullText = '';
            let buffer = '';

            res.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;
                    const data = line.slice(5).trim();
                    if (data === '[DONE]') continue;
                    try {
                        const json = JSON.parse(data);
                        const content = json?.choices?.[0]?.delta?.content;
                        if (content) fullText += content;
                    } catch (_) {}
                }
            });

            res.on('end', () => resolve(fullText));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

module.exports = function(app) {
    app.get('/ai/lumi', async (req, res) => {
        const { text } = req.query;

        if (!text || !text.trim()) return res.status(400).json({
            status: false,
            message: "Parameter 'text' wajib diisi! Contoh: /ai/lumi?text=siapa kamu"
        });

        try {
            const { csrfToken, cookieStr } = await getTokens();
            const result = await chat(csrfToken, cookieStr, text.trim());

            if (!result) throw new Error('Tidak ada respons dari Lumi.');

            res.json({
                status: true,
                category: 'Artificial Intelligence',
                query: text.trim(),
                data: {
                    author: 'Lumi',
                    response: result
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
