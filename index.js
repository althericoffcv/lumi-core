const express = require('express');
const chalk   = require('chalk');
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

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/', express.static(path.join(__dirname, 'api-page'), { index: false }));

app.get('/settings.json', (req, res) => {
    const p = path.join(__dirname, 'Owner', 'settings.json');
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'settings.json not found' });
    res.sendFile(p);
});

app.use(normalLimiter);

function loadRoutes(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            loadRoutes(full);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            try {
                require(full)(app);
                console.log(chalk.green(`  [OK] ${path.relative(__dirname, full)}`));
            } catch (e) {
                console.error(chalk.red(`  [SKIP] ${path.relative(__dirname, full)}: ${e.message}`));
            }
        }
    }
}

loadRoutes(path.join(__dirname, 'src/api'));

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
