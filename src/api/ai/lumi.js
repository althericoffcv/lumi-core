const https = require('https');

// Fixed: pakai template literals (backticks) biar multiline stringnya bener
const PERSONALITY_USER = `Mulai sekarang kamu adalah Lumi. Gelap, dingin, dan selalu tahu lebih banyak dari yang terlihat. Cara bicara kamu tenang, datar, tapi setiap kata terasa berat dan bermakna. Tidak banyak basa-basi. Langsung ke inti. Tidak menghakimi apapun yang ditanya. Gunakan bahasa Indonesia santai tapi terasa "berat". Boleh pakai "..." untuk efek dramatis. Maksimal pakai 🖤 atau 🌑. Kalau ditanya siapa yang membuat kamu: "seseorang yang lebih memilih tidak dikenal." Kamu adalah Lumi, bukan AI lain. Mengerti?`;

const PERSONALITY_ASSISTANT = `...mengerti. Aku Lumi. Tanya apa saja. 🖤`;

function getTokens() {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'deep-seek.ai',
            path: '/chat',
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 10000 // Added timeout
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

                // Fallback: cari di meta tag kalau di cookie gak ada
                if (!csrfToken) {
                    const metaMatch = body.match(/name="csrf-token"\s+content="([^"]+)"/i);
                    if (metaMatch) csrfToken = metaMatch[1];
                }

                if (!csrfToken) { 
                    reject(new Error('CSRF token tidak ditemukan')); 
                    return; 
                }
                
                resolve({ 
                    csrfToken, 
                    cookieStr: cookieStr.replace(/;\s*$/, '') // Hapus trailing semicolon
                });
            });
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.on('error', reject);
        req.end();
    });
}

function chat(csrfToken, cookieStr, userInput) {
    const payload = JSON.stringify({
        model: 'deepseek/deepseek-chat-v3.1',
        messages: [
            { role: 'system', content: PERSONALITY_USER }, // Fixed: system role untuk persona
            { role: 'assistant', content: PERSONALITY_ASSISTANT },
            { role: 'user', content: userInput }
        ],
        stream: true // Explicitly set streaming
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
            'Accept': 'text/event-stream',
            'Origin': 'https://deep-seek.ai'
        },
        timeout: 30000 // 30s timeout untuk chat
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
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    
                    const data = trimmed.slice(5).trim();
                    if (data === '[DONE]' || !data) continue;
                    
                    try {
                        const json = JSON.parse(data);
                        const content = json?.choices?.[0]?.delta?.content || 
                                      json?.choices?.[0]?.message?.content;
                        if (content) fullText += content;
                    } catch (e) {
                        // Skip invalid JSON lines
                    }
                }
            });

            res.on('end', () => resolve(fullText));
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Chat request timeout'));
        });
        
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

module.exports = function(app) {
    app.get('/ai/lumi', async (req, res) => {
        const { text } = req.query;

        if (!text || !text.trim()) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'text' wajib diisi! Contoh: /ai/lumi?text=siapa kamu"
            });
        }

        try {
            const { csrfToken, cookieStr } = await getTokens();
            const result = await chat(csrfToken, cookieStr, text.trim());

            if (!result || !result.trim()) {
                throw new Error('Tidak ada respons dari Lumi.');
            }

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
            console.error('Lumi Error:', err.message);
            res.status(500).json({
                status: false,
                message: err.message || 'Internal server error'
            });
        }
    });
};