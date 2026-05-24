const express = require('express');
const chalk   = require('chalk');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const app     = express();
const { normalLimiter } = require('./src/lib/rateLimiter');

process.on('uncaughtException',  (err) => console.error(err.message));
process.on('unhandledRejection', (err) => console.error(err?.message || err));

const PORT = parseInt(process.env.PORT) || 3000;

app.set('trust proxy', 1);
app.set('json spaces', 2);
app.disable('x-powered-by');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// CORS — izinkan semua origin
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Serve GIF/images from root-level /image/ folder
app.use('/image', express.static(path.join(__dirname, 'image')));

// Serve static assets from api-page
app.use('/', express.static(path.join(__dirname, 'api-page'), { index: false }));

// Serve settings.json from Owner/
app.get('/settings.json', (req, res) => {
    const p = path.join(__dirname, 'Owner', 'settings.json');
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'settings.json not found' });
    res.sendFile(p);
});

app.use(normalLimiter);

// ── Load routes ──────────────────────────────────────────────────────────────
try { require('./src/api/search/pinterest')(app); } catch(e) { console.error('[SKIP] pinterest:', e.message); }
try { require('./src/api/download/tiktok')(app); } catch(e) { console.error('[SKIP] tiktok:', e.message); }

// Serve the API docs page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'api-page', 'index.html'));
});

app.use((req, res) => {
    res.status(404).json({
        status: false,
        message: `Endpoint '${req.path}' not found`,
        docs: '/'
    });
});

app.listen(PORT, () => {
    console.log(chalk.cyan('\n  Lumi Base API'));
    console.log(chalk.green(`  Running on http://localhost:${PORT}\n`));
});

module.exports = app;
