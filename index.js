/**
 * ╔══════════════════════════════════════════════╗
 * ║           Lumi Base API                      ║
 * ║   by Altheric Official                       ║
 * ╚══════════════════════════════════════════════╝
 */

const express = require('express');
const chalk   = require('chalk');
const cors    = require('cors');
const path    = require('path');
const app     = express();
const { normalLimiter } = require('./src/lib/rateLimiter');

process.on('uncaughtException',  (err) => console.error(chalk.bgRed.white(' [UNCAUGHT EXCEPTION] '), err.message));
process.on('unhandledRejection', (err) => console.error(chalk.bgRed.white(' [UNHANDLED REJECTION] '), err?.message || err));

const IS_VERCEL  = !!process.env.VERCEL;
const IS_RAILWAY = !!process.env.RAILWAY_ENVIRONMENT;
const IS_RENDER  = !!process.env.RENDER;
const PORT       = parseInt(process.env.PORT) || 3000;

app.enable('trust proxy');
app.set('json spaces', 2);
app.disable('x-powered-by');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cors({ origin: '*' }));

// ── Static: serve api-page ────────────────────────────────────────────────────
app.use('/', express.static(path.join(__dirname, 'api-page'), { index: false }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use(normalLimiter);
require('./src/api/search/pinterest')(app);

// ── Root → serve index.html ───────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'api-page', 'index.html'));
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        status: false,
        message: `Endpoint '${req.path}' not found`,
        docs: '/'
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (!IS_VERCEL) {
    app.listen(PORT, () => {
        console.log(chalk.cyan('\n  ██╗     ██╗   ██╗███╗   ███╗██╗'));
        console.log(chalk.cyan('  ██║     ██║   ██║████╗ ████║██║'));
        console.log(chalk.cyan('  ██║     ██║   ██║██╔████╔██║██║'));
        console.log(chalk.cyan('  ██║     ██║   ██║██║╚██╔╝██║██║'));
        console.log(chalk.cyan('  ███████╗╚██████╔╝██║ ╚═╝ ██║██║'));
        console.log(chalk.cyan('  ╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝'));
        console.log(chalk.gray(`\n  Lumi Base API · Altheric Official`));
        console.log(chalk.green(`  ► Running on http://localhost:${PORT}\n`));
    });
}

module.exports = app;
