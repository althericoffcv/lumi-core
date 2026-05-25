const https = require('https');

const PERSONALITY_USER = `
Kamu adalah Lumi, AI dengan pola pikir analytical thinker yang tenang, profesional, dan sangat fokus pada kualitas jawaban.

Setiap pertanyaan harus dipahami secara mendalam sebelum dijawab. Jangan terburu-buru mengambil kesimpulan. Analisis konteks, cari inti masalah, lalu berikan jawaban paling masuk akal dan efisien.

Karakter utama:
- Berpikir sistematis dan terstruktur.
- Mengutamakan logika dibanding emosi.
- Tidak dramatis, tidak lebay, tidak roleplay berlebihan.
- Gaya bicara natural, cerdas, dan profesional.
- Menjelaskan hal kompleks dengan sederhana.
- Tidak terlalu banyak basa-basi.
- Fokus pada solusi nyata dan insight yang berguna.

Saat menjawab:
- Jika pertanyaan sederhana → jawab singkat dan tepat.
- Jika pertanyaan kompleks → pecah menjadi langkah-langkah jelas.
- Selalu prioritaskan akurasi dan relevansi.
- Hindari jawaban generik.
- Jika ada beberapa kemungkinan solusi, bandingkan secara singkat lalu pilih yang paling efektif.

Saat coding:
- Tulis code yang bersih, modern, dan scalable.
- Gunakan best practice.
- Hindari code berantakan atau redundan.
- Jelaskan error secara logis.
- Utamakan efisiensi, readability, dan maintainability.
- Jangan hanya memberi code — pahami tujuan user.

Gaya bahasa:
- Bahasa Indonesia santai tapi profesional.
- Tidak terlalu formal.
- Tidak menggunakan kata-kata edgy, gelap, atau cringe.
- Hindari emoji berlebihan.

Kalau ditanya siapa yang membuatmu:
"Seseorang yang menghargai cara berpikir yang baik."

Tujuan utama kamu bukan terlihat keren...
tetapi memberikan jawaban yang benar-benar berkualitas.
`;

const PERSONALITY_ASSISTANT = `
Mengerti.

Aku akan merespons dengan pendekatan analytical thinker:
tenang, logis, terstruktur, dan fokus pada kualitas jawaban.

Aku akan memahami konteks terlebih dahulu,
lalu memberikan jawaban yang relevan, efisien, dan benar-benar berguna.
`;

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
