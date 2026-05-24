const { createCanvas } = require('@napi-rs/canvas');

module.exports = (app) => {
    app.get('/canvas/brat', async (req, res) => {
        try {
            const raw = req.query.text || '';

            if (!raw.trim()) {
                return res.status(400).json({
                    status: false,
                    message: 'Query parameter ?text= is required'
                });
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

            const setFont = (size) => {
                ctx.font = `${size}px Arial, sans-serif`;
            };

            const wrapText = (txt, maxW, size) => {
                setFont(size);
                const words = txt.split(' ');
                const lines = [];
                let cur = '';
                for (const w of words) {
                    const test = cur ? `${cur} ${w}` : w;
                    if (ctx.measureText(test).width > maxW && cur) {
                        lines.push(cur);
                        cur = w;
                    } else {
                        cur = test;
                    }
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
            lines.forEach((line, i) => {
                ctx.fillText(line, SIZE / 2, startY + i * lineH);
            });

            const buffer = canvas.toBuffer('image/png');

            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': buffer.length,
                'Cache-Control': 'public, max-age=300'
            });
            res.end(buffer, 'binary');

        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });
};
