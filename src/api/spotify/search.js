const axios = require('axios');

let tokenCache = {
    accessToken: null,
    clientToken: null,
    expiresAt: 0,
};

const CLIENT_ID = 'd8a5ed958d274c2e8ee717e6a4b0971d';

async function getTokens() {
    const now = Date.now();
    if (tokenCache.accessToken && tokenCache.clientToken && now < tokenCache.expiresAt) {
        return tokenCache;
    }

    // Step 1: Access token (anonymous, tidak perlu cookie)
    const tokenRes = await axios.get('https://open.spotify.com/api/token', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://open.spotify.com/',
        },
        timeout: 10000,
    });

    const accessToken = tokenRes.data?.accessToken;
    const expireTime = tokenRes.data?.accessTokenExpirationTimestampMs || (now + 3600000);
    if (!accessToken) throw new Error(`access token kosong. Response: ${JSON.stringify(tokenRes.data)}`);

    // Step 2: Client token
    const clientTokenRes = await axios.post(
        'https://clienttoken.spotify.com/v1/clienttoken',
        {
            client_data: {
                client_version: '1.2.91.260.ga74a5f05',
                client_id: CLIENT_ID,
                js_sdk_data: {
                    device_brand: 'unknown',
                    device_model: 'unknown',
                    os: 'linux',
                    os_version: 'unknown',
                },
            },
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            timeout: 10000,
        }
    );

    const clientToken = clientTokenRes.data?.granted_token?.token;
    if (!clientToken) throw new Error(`client token kosong. Response: ${JSON.stringify(clientTokenRes.data)}`);

    tokenCache = { accessToken, clientToken, expiresAt: expireTime - 60000 };
    return tokenCache;
}

module.exports = function(app) {

    // Debug endpoint — cek token aja
    app.get('/search/spotify/debug', async (req, res) => {
        const steps = {};
        try {
            // Step 1: access token
            try {
                const r = await axios.get('https://open.spotify.com/api/token', {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
                        'Referer': 'https://open.spotify.com/',
                    },
                    timeout: 10000,
                });
                steps.accessToken = {
                    ok: !!r.data?.accessToken,
                    token_preview: r.data?.accessToken?.slice(0, 30) + '...',
                    expires: r.data?.accessTokenExpirationTimestampMs,
                    raw: r.data,
                };
            } catch(e) {
                steps.accessToken = { ok: false, error: e.message, status: e.response?.status, data: e.response?.data };
            }

            // Step 2: client token
            if (steps.accessToken.ok) {
                try {
                    const r = await axios.post('https://clienttoken.spotify.com/v1/clienttoken', {
                        client_data: {
                            client_version: '1.2.91.260.ga74a5f05',
                            client_id: CLIENT_ID,
                            js_sdk_data: { device_brand: 'unknown', device_model: 'unknown', os: 'linux', os_version: 'unknown' },
                        },
                    }, {
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        timeout: 10000,
                    });
                    steps.clientToken = {
                        ok: !!r.data?.granted_token?.token,
                        token_preview: r.data?.granted_token?.token?.slice(0, 30) + '...',
                        raw: r.data,
                    };
                } catch(e) {
                    steps.clientToken = { ok: false, error: e.message, status: e.response?.status, data: e.response?.data };
                }
            }

            // Step 3: test search pakai token yang didapat
            if (steps.accessToken.ok && steps.clientToken?.ok) {
                try {
                    const r = await axios.post('https://api-partner.spotify.com/pathfinder/v2/query', {
                        variables: { query: 'test', numberOfTopResults: 3, operationName: 'findTopResults' },
                        extensions: {
                            persistedQuery: {
                                version: 1,
                                sha256Hash: '755858df4daab8d212980b02a81dcf8c9a58447de318b59d07c4651a1d409905',
                            },
                        },
                    }, {
                        headers: {
                            'Authorization': `Bearer ${steps.accessToken.token_preview.replace('...', '')}`,
                            'Client-Token': steps.clientToken.token_preview.replace('...', ''),
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'Origin': 'https://open.spotify.com',
                            'Referer': 'https://open.spotify.com/',
                            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
                        },
                        timeout: 10000,
                    });
                    steps.searchTest = { ok: true, status: r.status, keys: Object.keys(r.data?.data?.searchV2 || {}) };
                } catch(e) {
                    steps.searchTest = { ok: false, error: e.message, status: e.response?.status, data: e.response?.data };
                }
            }

            res.json({ status: true, steps });
        } catch(e) {
            res.json({ status: false, error: e.message, steps });
        }
    });

    // Main search endpoint
    app.get('/search/spotify', async (req, res) => {
        const { q, limit = 20 } = req.query;
        if (!q) return res.status(400).json({
            status: false,
            message: "Parameter 'q' wajib diisi! Contoh: /search/spotify?q=tek+it",
        });

        try {
            const { accessToken, clientToken } = await getTokens();

            const { data } = await axios.post(
                'https://api-partner.spotify.com/pathfinder/v2/query',
                {
                    variables: { query: q, numberOfTopResults: parseInt(limit), operationName: 'findTopResults' },
                    extensions: {
                        persistedQuery: {
                            version: 1,
                            sha256Hash: '755858df4daab8d212980b02a81dcf8c9a58447de318b59d07c4651a1d409905',
                        },
                    },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Client-Token': clientToken,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Origin': 'https://open.spotify.com',
                        'Referer': 'https://open.spotify.com/',
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
                    },
                    timeout: 10000,
                }
            );

            const searchV2 = data?.data?.searchV2;
            if (!searchV2) return res.status(502).json({ status: false, message: 'Respons tidak valid dari Spotify', raw: data });

            const tracks = (searchV2.tracksV2?.items || []).map(item => {
                const t = item?.item?.data;
                if (!t) return null;
                return {
                    type: 'track',
                    id: t.id,
                    name: t.name,
                    url: `https://open.spotify.com/track/${t.id}`,
                    thumbnail: t.albumOfTrack?.coverArt?.sources?.[0]?.url || null,
                    artists: (t.artists?.items || []).map(a => ({ name: a.profile?.name })),
                    album: t.albumOfTrack?.name || null,
                    duration_ms: t.duration?.totalMilliseconds || null,
                };
            }).filter(Boolean);

            const artists = (searchV2.artists?.items || []).map(item => {
                const a = item?.data;
                if (!a) return null;
                return {
                    type: 'artist',
                    id: a.id,
                    name: a.profile?.name,
                    url: `https://open.spotify.com/artist/${a.id}`,
                    thumbnail: a.visuals?.avatarImage?.sources?.[0]?.url || null,
                    verified: a.profile?.verified || false,
                };
            }).filter(Boolean);

            const albums = (searchV2.albumsV2?.items || []).map(item => {
                const al = item?.data;
                if (!al) return null;
                return {
                    type: 'album',
                    id: al.id,
                    name: al.name,
                    url: `https://open.spotify.com/album/${al.id}`,
                    thumbnail: al.coverArt?.sources?.[0]?.url || null,
                    artists: (al.artists?.items || []).map(a => ({ name: a.profile?.name })),
                    year: al.date?.year || null,
                };
            }).filter(Boolean);

            res.json({ status: true, query: q, data: { tracks, artists, albums } });

        } catch (err) {
            tokenCache = { accessToken: null, clientToken: null, expiresAt: 0 };
            res.status(500).json({ status: false, message: err.message });
        }
    });
};
