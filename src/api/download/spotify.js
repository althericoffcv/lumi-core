// src/api/download/spotify.js
// Endpoint: GET /downloader/spotify?url=https://open.spotify.com/track/xxx

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

function makeHeaders(cookie = '', extra = {}) {
    return {
        'accept-language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Chromium";v="139", "Not.A/Brand";v="99"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'user-agent': UA,
        ...(cookie && { cookie }),
        ...extra,
    };
}

function parseCookies(headers) {
    const jar = {};
    const list = typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : [headers.get('set-cookie')].filter(Boolean);
    for (const c of list) {
        const part = c.split(';')[0].trim();
        const idx = part.indexOf('=');
        if (idx > -1) jar[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
    return jar;
}

function buildCookieStr(jar) {
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function isSpotifyUrl(url) {
    return /^https?:\/\/open\.spotify\.com\/(track|album|playlist)\//.test(url?.trim());
}

async function spotidown(spotifyUrl) {
    // ── Step 0: GET halaman → ambil session cookie + token field ──────────────
    const pageRes = await fetch('https://spotidown.app/en3', {
        headers: makeHeaders('', { 'accept': 'text/html,*/*' }),
    });

    let cookieJar = parseCookies(pageRes.headers);
    const html = await pageRes.text();

    // Ambil token field dinamis (nama berubah tiap session, misal _vCMco, _BvJsl)
    let tokenFieldName = null;
    let tokenValue     = null;
    for (const m of html.matchAll(/<input[^>]+type=["']hidden["'][^>]*>/gi)) {
        const name  = m[0].match(/name=["']([^"']+)["']/)?.[1];
        const value = m[0].match(/value=["']([^"']*?)["']/)?.[1] ?? '';
        if (name && name !== 'g-recaptcha-response') {
            tokenFieldName = name;
            tokenValue     = value;
            break;
        }
    }

    if (!tokenFieldName || !tokenValue) {
        throw new Error('Gagal ambil token dari halaman spotidown.');
    }

    // ── Step 1: POST /action → dapat form fields ───────────────────────────────
    const body1 = new URLSearchParams({
        url: spotifyUrl,
        'g-recaptcha-response': '',
        [tokenFieldName]: tokenValue,
    });

    const actionRes = await fetch('https://spotidown.app/action', {
        method: 'POST',
        headers: makeHeaders(buildCookieStr(cookieJar), {
            'accept': '*/*',
            'content-type': 'application/x-www-form-urlencoded',
            'origin': 'https://spotidown.app',
            'referer': 'https://spotidown.app/en3',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'x-requested-with': 'XMLHttpRequest',
        }),
        body: body1.toString(),
    });

    Object.assign(cookieJar, parseCookies(actionRes.headers));

    const action1 = await actionRes.json();
    if (action1.error) {
        throw new Error(`[spotidown step1] ${action1.message || action1.errorcode}`);
    }

    const dataM  = action1.data.match(/name="data"\s+value='([^']+)'/);
    const baseM  = action1.data.match(/name="base"\s+value="([^"]+)"/);
    const tokenM = action1.data.match(/name="token"\s+value="([^"]+)"/);

    if (!dataM || !baseM || !tokenM) {
        throw new Error('Gagal parse form fields dari step 1.');
    }

    // ── Step 2: POST /action/track → dapat link download ──────────────────────
    const body2 = new URLSearchParams({
        data:  dataM[1],
        base:  baseM[1],
        token: tokenM[1],
    });

    const trackRes = await fetch('https://spotidown.app/action/track', {
        method: 'POST',
        headers: makeHeaders(buildCookieStr(cookieJar), {
            'accept': 'application/json, */*',
            'content-type': 'application/x-www-form-urlencoded',
            'origin': 'https://spotidown.app',
            'referer': 'https://spotidown.app/en3',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'x-requested-with': 'XMLHttpRequest',
        }),
        body: body2.toString(),
    });

    const action2 = await trackRes.json();
    if (action2.error) {
        throw new Error(`[spotidown step2] ${JSON.stringify(action2)}`);
    }

    // ── Parse download links ───────────────────────────────────────────────────
    const links  = {};
    const linkRe = /href="(https:\/\/rapid\.spotidown\.app\/v2\?token=[^"]+)"/g;
    const lblRe  = /<span><span>([^<]+)<\/span><\/span>/g;
    const urls   = [];
    const labels = [];
    let m;

    while ((m = linkRe.exec(action2.data)) !== null) urls.push(m[1]);
    while ((m = lblRe.exec(action2.data))  !== null) labels.push(m[1].trim());

    urls.forEach((url, i) => {
        const key = (labels[i] || `link_${i+1}`)
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '');
        links[key] = url;
    });

    // ── Parse metadata dari data field (base64 JSON) ──────────────────────────
    let meta = {};
    try {
        meta = JSON.parse(Buffer.from(dataM[1], 'base64').toString('utf8'));
    } catch { /* metadata optional */ }

    return { meta, links };
}

module.exports = function(app) {
    app.get('/downloader/spotify', async (req, res) => {
        const { url } = req.query;

        if (!url) return res.status(400).json({
            status: false,
            message: "Parameter 'url' wajib diisi! Contoh: /downloader/spotify?url=https://open.spotify.com/track/xxx"
        });

        if (!isSpotifyUrl(url)) return res.status(400).json({
            status: false,
            message: 'URL bukan Spotify yang valid. Harus berformat: https://open.spotify.com/track/...'
        });

        try {
            const { meta, links } = await spotidown(url);

            res.json({
                status: true,
                url,
                data: {
                    title:    meta.name     || null,
                    artist:   meta.artist   || null,
                    album:    meta.album    || null,
                    cover:    meta.cover    || null,
                    duration: meta.duration || null,
                    year:     meta.date     || null,
                    download: links
                }
            });
        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });
};
