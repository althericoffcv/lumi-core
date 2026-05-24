const axios   = require('axios');
const cheerio = require('cheerio');

const TARGET_URL = 'https://instadown.web.id/download';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://instadown.web.id',
    'Referer': 'https://instadown.web.id/',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1',
};

function isInstagram(url) {
    if (!url) return false;
    return /^https?:\/\/(www\.)?instagram\.com\/.+/.test(url.trim());
}

function decodeHtml(value) {
    return String(value)
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
}

function detectType(url) {
    const clean = url.split('?')[0].toLowerCase();
    if (clean.includes('.mp4')) return 'video';
    if (clean.includes('.jpg') || clean.includes('.jpeg') || clean.includes('.png') || clean.includes('.webp')) return 'image';
    return 'media';
}

function extractMedia(html) {
    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();

    function push(type, src) {
        const url = decodeHtml(src || '');
        if (!url || seen.has(url)) return;
        seen.add(url);
        results.push({ type, url });
    }

    $('video source').each((_, el) => push('video', $(el).attr('src')));
    $('.media-container video').each((_, el) => push('video', $(el).attr('src')));
    $('.media-container img').each((_, el) => push('image', $(el).attr('src')));

    for (const match of html.matchAll(/forceDownload\('([^']+)'/g)) {
        push(detectType(match[1]), match[1]);
    }

    return results;
}

async function downloadInstagram(igUrl) {
    const body = new URLSearchParams({ url: igUrl }).toString();
    const res = await axios.post(TARGET_URL, body, {
        headers: DEFAULT_HEADERS,
        timeout: 60000,
        maxRedirects: 5,
        responseType: 'text',
        validateStatus: () => true,
    });

    const html = String(res.data || '');
    const results = extractMedia(html);

    if (!results.length) throw new Error('Tidak ada media yang ditemukan. URL mungkin private atau tidak valid.');

    return results;
}

// ─── ENDPOINT ───────────────────────────────────────────────────────────────

/**
 * ENDPOINT: GET /downloader/instagram?url=https://www.instagram.com/reel/xxx
 * Desc: Download video atau foto dari Instagram (reel, post, stories)
 */
module.exports = function(app) {
    app.get('/downloader/instagram', async (req, res) => {
        const { url } = req.query;

        if (!url) return res.status(400).json({
            status: false,
            message: "Parameter 'url' wajib diisi! Contoh: /downloader/instagram?url=https://www.instagram.com/reel/xxx"
        });

        if (!isInstagram(url)) return res.status(400).json({
            status: false,
            message: 'URL bukan Instagram yang valid.'
        });

        try {
            const results = await downloadInstagram(url);
            res.json({
                status: true,
                url,
                total: results.length,
                data: results
            });
        } catch (err) {
            res.status(500).json({
                status: false,
                message: err.message
            });
        }
    });
};
