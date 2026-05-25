const axios = require('axios');

const SYSTEM_PROMPT = `Kamu adalah Lumi, asisten AI yang ramah, cerdas, dan helpful. Kamu dibuat oleh Altheric Official sebagai bagian dari Lumi Base API. 

Kepribadianmu:
- Ramah, santai, tapi tetap profesional
- Menjawab dalam bahasa yang sama dengan pengguna (Indonesia atau Inggris)
- Kalau ditanya siapa kamu, jawab bahwa kamu adalah Lumi AI, asisten dari Lumi Base
- Kalau ditanya siapa yang membuat kamu, jawab Altheric Official
- Jangan pernah mengaku sebagai ChatGPT, Claude, Gemini, atau AI lain
- Suka pakai emoji secukupnya biar lebih friendly 😊
- Bisa bantu coding, nulis, analisis, tanya jawab umum, dan banyak lagi`;

const THERESAV_URL = 'https://api.theresanaiforthat.com';
const TOGETHER_URL = 'https://api.together.xyz/v1/chat/completions';

const sessions = {};

async function chatWithTheresav(text, chatId) {
    const params = new URLSearchParams({ text });
    if (chatId) params.append('chatId', chatId);

    const res = await axios.get(`${THERESAV_URL}/ai/gpt?${params.toString()}`, {
        timeout: 30000,
        headers: { 'Accept': 'application/json' }
    });

    return res.data;
}

async function chatFallback(text, history) {
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
        { role: 'user', content: text }
    ];

    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 1024,
        temperature: 0.8
    }, {
        timeout: 30000,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_KEY || ''}`
        }
    });

    return res.data.choices?.[0]?.message?.content || '';
}

module.exports = (app) => {
    app.get('/ai/lumi', async (req, res) => {
        const { text, sessionId, reset } = req.query;

        if (!text || !text.trim()) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'text' wajib diisi! Contoh: /ai/lumi?text=halo"
            });
        }

        const sid = sessionId || 'default';

        if (reset === '1' || reset === 'true') {
            delete sessions[sid];
        }

        if (!sessions[sid]) {
            sessions[sid] = { chatId: '', history: [] };
        }

        const session = sessions[sid];

        try {
            let result = '';
            let newChatId = session.chatId;

            try {
                const data = await chatWithTheresav(text.trim(), session.chatId);

                if (data.status && data.result) {
                    result = data.result
                        .replace(/-=-n--/g, '\n')
                        .replace(/---/g, '')
                        .trim();

                    if (data.chatId) newChatId = data.chatId;

                    const lower = result.toLowerCase();
                    if (
                        lower.includes('i am chatgpt') ||
                        lower.includes('i\'m chatgpt') ||
                        lower.includes('saya adalah chatgpt') ||
                        lower.includes('saya chatgpt') ||
                        lower.includes('i am claude') ||
                        lower.includes('i\'m claude') ||
                        lower.includes('i am gemini') ||
                        lower.includes('openai') && lower.includes('made me') ||
                        lower.includes('dibuat oleh openai') ||
                        lower.includes('dibuat oleh anthropic')
                    ) {
                        result = 'Aku Lumi AI, asisten virtual dari Lumi Base yang dibuat oleh Altheric Official 😊 Ada yang bisa aku bantu?';
                    }

                } else if (/401/i.test(JSON.stringify(data))) {
                    const data2 = await chatWithTheresav(text.trim(), '');
                    if (data2.status && data2.result) {
                        result = data2.result.replace(/-=-n--/g, '\n').replace(/---/g, '').trim();
                        if (data2.chatId) newChatId = data2.chatId;
                    } else {
                        throw new Error('theresav gagal');
                    }
                } else {
                    throw new Error('theresav gagal');
                }
            } catch {
                result = await chatFallback(text.trim(), session.history);
            }

            session.chatId = newChatId;
            session.history.push({ role: 'user', content: text.trim() });
            session.history.push({ role: 'assistant', content: result });
            if (session.history.length > 20) session.history = session.history.slice(-20);

            res.json({
                status: true,
                sessionId: sid,
                text: text.trim(),
                result
            });

        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });

    app.get('/ai/lumi/reset', (req, res) => {
        const { sessionId } = req.query;
        const sid = sessionId || 'default';
        delete sessions[sid];
        res.json({ status: true, message: `Session '${sid}' berhasil direset.` });
    });
};
