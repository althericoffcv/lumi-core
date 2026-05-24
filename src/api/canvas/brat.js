const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

GlobalFonts.registerFromPath(path.join(process.cwd(), 'font/Arimo.ttf'), 'Arimo');
GlobalFonts.registerFromPath(path.join(process.cwd(), 'font/NotoColorEmoji.ttf'), 'NotoColorEmoji');

const EMOJI_RE = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;

const charWidth = (line, fontSize) => {
    let total = 0;
    for (const c of [...line]) {
        EMOJI_RE.lastIndex = 0;
        total += EMOJI_RE.test(c) ? fontSize * 1.1 : fontSize * 0.55;
    }
    return total;
};

const wrapText = (txt, maxW, fontSize) => {
    const tokens = [...txt];
    const lines  = [];
    let cur = '';

    for (const token of tokens) {
        const test = cur + token;
        if (charWidth(test, fontSize) > maxW && cur) {
            lines.push(cur);
            cur = token;
        } else {
            cur = test;
        }
    }
    if (cur) lines.push(cur);
    return lines;
};

module.exports = (app) => {
    app.get('/canvas/brat', (req, res) => {
        try {
            const raw = req.query.text || '';
            if (!raw.trim()) {
                return res.status(400).json({ status: false, message: 'Query parameter ?text= is required' });
            }

            const text   = [...raw.toLowerCase()].slice(0, 100).join('');
            const SIZE   = 600;
            const MAX_W  = SIZE * 0.82;

            const canvas = createCanvas(SIZE, SIZE);
            const ctx    = canvas.getContext('2d');

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, SIZE, SIZE);
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';

            const setFont = (size) => { ctx.font = `${size}px Arimo, NotoColorEmoji`; };

            let fontSize = 100;
            let lines;
            while (fontSize >= 16) {
                lines = wrapText(text, MAX_W, fontSize);
                const lineH  = fontSize * 1.3;
                const totalH = lines.length * lineH;
                const maxW   = Math.max(...lines.map(l => charWidth(l, fontSize)));
                if (totalH <= SIZE * 0.82 && maxW <= MAX_W) break;
                fontSize -= 2;
            }

            const lineH  = fontSize * 1.3;
            const totalH = lines.length * lineH;
            const startY = (SIZE - totalH) / 2 + lineH / 2;

            ctx.fillStyle     = '#000000';
            ctx.shadowColor   = 'rgba(0,0,0,0.55)';
            ctx.shadowBlur    = Math.max(1.5, fontSize * 0.07);
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            setFont(fontSize);
            lines.forEach((line, i) => ctx.fillText(line, SIZE / 2, startY + i * lineH));

            const buffer = canvas.toBuffer('image/png');
            res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buffer.length });
            res.end(buffer, 'binary');

        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });
};
