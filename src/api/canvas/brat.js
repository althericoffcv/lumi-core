const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

const fontPath = path.join(__dirname, '../../fonts/Arimo.ttf');
if (fs.existsSync(fontPath)) {
    GlobalFonts.registerFromPath(fontPath, 'Arimo');
} else {
    console.error('[brat] font not found at:', fontPath);
}

module.exports = (app) => {
    app.get('/canvas/brat', (req, res) => {
        try {
            const raw = req.query.text || '';

            if (!raw.trim()) {
                return res.status(400).json({ status: false, message: 'Query parameter ?text= is required' });
            }

            const families = GlobalFonts.families.map(f => f.family);
            console.log('[brat] registered fonts:', families);

            if (!families.includes('Arimo')) {
                return res.status(500).json({ status: false, message: 'Font Arimo not loaded. families: ' + families.join(', ') });
            }

            const text  = raw.toLowerCase();
            const SIZE  = 600;
            const MAX_W = SIZE * 0.80;

            const canvas = createCanvas(SIZE, SIZE);
            const ctx    = canvas.getContext('2d');

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, SIZE, SIZE);
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';

            const setFont = (size) => { ctx.font = `${size}px Arimo`; };

            const wrapText = (txt, maxW, size) => {
                setFont(size);
                const words = txt.split(' ');
                const lines = [];
                let cur = '';
                for (const w of words) {
                    const test = cur ? `${cur} ${w}` : w;
                    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
                    else cur = test;
                }
                if (cur) lines.push(cur);
                return lines;
            };

            let fontSize = 100;
            let lines;
            while (fontSize >= 16) {
                lines = wrapText(text, MAX_W, fontSize);
                setFont(fontSize);
                const lineH  = fontSize * 1.22;
                const totalH = lines.length * lineH;
                const maxW   = Math.max(...lines.map(l => { setFont(fontSize); return ctx.measureText(l).width; }));
                if (totalH <= SIZE * 0.82 && maxW <= MAX_W) break;
                fontSize -= 2;
            }

            const lineH  = fontSize * 1.22;
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
            console.error('[brat] error:', err);
            res.status(500).json({ status: false, message: err.message });
        }
    });
};
