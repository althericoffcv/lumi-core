const axios = require('axios');

module.exports = function(app) {

    // ─── HELPERS ────────────────────────────────────────────────────────────────

    function isPin(url) {
        if (!url) return false;
        const patterns = [
            /^https?:\/\/(?:www\.)?pinterest\.com\/pin\/[\w.-]+/,
            /^https?:\/\/(?:www\.)?pinterest\.[\w.]+\/pin\/[\w.-]+/,
            /^https?:\/\/(?:www\.)?pinterest\.(?:ca|co\.uk|com\.au|de|fr|id|es|mx|br|pt|jp|kr|nz|ru|at|be|ch|cl|dk|fi|gr|ie|nl|no|pl|se|th|tr)\/pin\/[\w.-]+/,
            /^https?:\/\/pin\.it\/[\w.-]+/,
            /^https?:\/\/(?:www\.)?pinterest\.com\/amp\/pin\/[\w.-]+/,
            /^https?:\/\/(?:[a-z]{2}|www)\.pinterest\.com\/pin\/[\w.-]+/,
            /^https?:\/\/(?:www\.)?pinterest\.com\/pin\/[\d]+(?:\/)?$/,
            /^https?:\/\/(?:www\.)?pinterest\.[\w.]+\/pin\/[\d]+(?:\/)?$/,
            /^https?:\/\/(?:www\.)?pinterestcn\.com\/pin\/[\w.-]+/,
            /^https?:\/\/(?:www\.)?pinterest\.com\.[\w.]+\/pin\/[\w.-]+/,
        ];
        return patterns.some(p => p.test(url.trim().toLowerCase()));
    }

    async function getCookies() {
        const response = await axios.get('https://www.pinterest.com/', {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-language': 'en-US,en;q=0.9',
            },
            maxRedirects: 5,
        });

        const setCookieHeaders = response.headers['set-cookie'];
        if (!setCookieHeaders || setCookieHeaders.length === 0) throw new Error('Gagal ambil cookies dari Pinterest');

        const cookieMap = {};
        for (const raw of setCookieHeaders) {
            const part = raw.split(';')[0].trim();
            const eqIdx = part.indexOf('=');
            if (eqIdx === -1) continue;
            cookieMap[part.substring(0, eqIdx).trim()] = part.substring(eqIdx + 1).trim();
        }

        return {
            cookieStr: Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; '),
            csrfToken: cookieMap['csrftoken'] || ''
        };
    }

    // ─── CORE FUNCTIONS ─────────────────────────────────────────────────────────

    async function pinterest(query, limit = 20) {
        const { cookieStr, csrfToken } = await getCookies();

        const params = {
            source_url: `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`,
            data: JSON.stringify({
                options: {
                    isPrefetch: false,
                    query,
                    scope: 'pins',
                    no_fetch_context_on_resource: false,
                    page_size: Math.min(limit, 50)
                },
                context: {}
            }),
            _: Date.now()
        };

        const headers = {
            'accept': 'application/json, text/javascript, */*, q=0.01',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'en-US,en;q=0.9',
            'cookie': cookieStr,
            'dnt': '1',
            'referer': `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`,
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'x-app-version': 'c056fb7',
            'x-pinterest-appstate': 'active',
            'x-pinterest-pws-handler': 'www/search/[scope].js',
            'x-pinterest-source-url': `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`,
            'x-requested-with': 'XMLHttpRequest',
            ...(csrfToken ? { 'x-csrftoken': csrfToken } : {})
        };

        const { data } = await axios.get('https://www.pinterest.com/resource/BaseSearchResource/get/', { headers, params });

        const results = data.resource_response.data.results.filter(v => v.images?.orig);

        return results.slice(0, limit).map(r => ({
            id: r.id,
            caption: r.grid_title || '',
            image: r.images.orig.url,
            source: `https://id.pinterest.com/pin/${r.id}`,
            uploader: {
                username: r.pinner?.username || '',
                fullname: r.pinner?.full_name || '',
                followers: r.pinner?.follower_count || 0,
            }
        }));
    }

    async function pindl(pinUrl) {
        const { cookieStr, csrfToken } = await getCookies();

        let pinId = pinUrl.split('/pin/')[1]?.replace(/\//g, '');

        if (!pinId) {
            const redirectRes = await axios.get(pinUrl, {
                headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            pinId = redirectRes.request.res.responseUrl.split('/pin/')[1].split('/')[0];
        }

        const headers = {
            'accept': 'application/json, text/javascript, */*, q=0.01',
            'cookie': cookieStr,
            'referer': 'https://www.pinterest.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'x-app-version': 'a9522f',
            'x-pinterest-appstate': 'active',
            'x-pinterest-pws-handler': 'www/[username]/[slug].js',
            'x-pinterest-source-url': '/pin-resource/',
            'x-requested-with': 'XMLHttpRequest',
            ...(csrfToken ? { 'x-csrftoken': csrfToken } : {})
        };

        const params = {
            source_url: `/pin/${pinId}/`,
            data: JSON.stringify({
                options: { field_set_key: 'detailed', id: pinId },
                context: {}
            }),
            _: Date.now()
        };

        const { data } = await axios.get('https://www.pinterest.com/resource/PinResource/get/', { headers, params });

        if (!data?.resource_response?.data) throw new Error('Pin tidak ditemukan atau sudah tidak tersedia');

        const pd = data.resource_response.data;
        const media = [];

        if (pd.videos) {
            Object.values(pd.videos.video_list)
                .sort((a, b) => b.width - a.width)
                .forEach(v => media.push({
                    type: 'video',
                    quality: `${v.width}x${v.height}`,
                    url: v.url,
                    width: v.width,
                    height: v.height
                }));
        }

        if (pd.images) {
            const sizes = {
                original: pd.images.orig,
                large: pd.images['736x'],
                medium: pd.images['474x'],
                small: pd.images['236x'],
                thumbnail: pd.images['170x']
            };
            Object.entries(sizes).forEach(([quality, img]) => {
                if (img) media.push({ type: 'image', quality, url: img.url, width: img.width, height: img.height });
            });
        }

        return {
            id: pd.id,
            title: pd.title || '',
            description: pd.description || '',
            media
        };
    }

    // ─── ENDPOINTS ──────────────────────────────────────────────────────────────

    /**
     * ENDPOINT: GET /search/pinterest?q=anime
     * Desc: Search Pinterest images by keyword, auto limit 20
     */
    app.get('/search/pinterest', async (req, res) => {
        const { q } = req.query;

        if (!q) return res.status(400).json({
            status: false,
            message: "Parameter 'q' wajib diisi! Contoh: /search/pinterest?q=anime"
        });

        try {
            const hasil = await pinterest(q, 20);

            if (!hasil || hasil.length === 0) return res.status(404).json({
                status: false,
                message: `Tidak ada hasil untuk "${q}"`
            });

            res.json({
                status: true,
                query: q,
                total: hasil.length,
                data: hasil
            });

        } catch (err) {
            res.status(500).json({
                status: false,
                message: err.message
            });
        }
    });

    /**
     * ENDPOINT: GET /downloader/pinterest?url=https://www.pinterest.com/pin/xxx
     * Desc: Get download info (image/video) dari Pinterest pin URL
     */
    app.get('/downloader/pinterest', async (req, res) => {
        const { url } = req.query;

        if (!url) return res.status(400).json({
            status: false,
            message: "Parameter 'url' wajib diisi! Contoh: /downloader/pinterest?url=https://www.pinterest.com/pin/xxx"
        });

        if (!isPin(url)) return res.status(400).json({
            status: false,
            message: "URL bukan pin Pinterest yang valid"
        });

        try {
            const result = await pindl(url);

            res.json({
                status: true,
                url,
                data: result
            });

        } catch (err) {
            res.status(500).json({
                status: false,
                message: err.message
            });
        }
    });

};
