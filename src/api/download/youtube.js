const axios = require('axios');

const TARGET_URL = 'https://app.ytdown.to/proxy.php';

const DEFAULT_HEADERS = {
    'User-Agent':       'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept':           '*/*',
    'Accept-Language':  'en-US,en;q=0.9',
    'Origin':           'https://app.ytdown.to',
    'Referer':          'https://app.ytdown.to/',
    'X-Requested-With': 'XMLHttpRequest',
};

function isYoutube(url) {
    if (!url) return false;
    return /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/.test(url.trim());
}

/**
 * ENDPOINT: GET /downloader/youtube?url=https://youtu.be/xxxx
 * Desc    : Download video YouTube, return link MP4 dan MP3/M4A
 */
module.exports = function (app) {
    app.get('/downloader/youtube', async (req, res) => {
        const { url } = req.query;

        if (!url) return res.status(400).json({
            status:  false,
            message: "Parameter 'url' wajib diisi! Contoh: /downloader/youtube?url=https://youtu.be/xxxx",
        });

        if (!isYoutube(url)) return res.status(400).json({
            status:  false,
            message: 'URL bukan YouTube yang valid.',
        });

        try {
            const body = new URLSearchParams({ url }).toString();
            const { data } = await axios.post(TARGET_URL, body, {
                headers: DEFAULT_HEADERS,
                timeout: 30000,
            });

            // response dibungkus dalam data.api
            const api   = data?.api || {};
            const items = api.mediaItems || [];

            if (!items.length) throw new Error('Tidak ada media yang ditemukan.');

            const mp4 = items
                .filter(i => i.type === 'Video' && i.mediaExtension === 'MP4')
                .map(i => ({
                    quality:  i.mediaQuality,
                    res:      i.mediaRes || null,
                    url:      i.mediaUrl,
                    size:     i.mediaFileSize || null,
                    duration: i.mediaDuration || null,
                }));

            const mp3 = items
                .filter(i => i.type === 'Audio')
                .map(i => ({
                    quality:   i.mediaQuality,
                    format:    i.mediaExtension,
                    url:       i.mediaUrl,
                    size:      i.mediaFileSize || null,
                    duration:  i.mediaDuration || null,
                }));

            res.json({
                status:    true,
                url,
                title:     api.title     || null,
                thumbnail: api.imagePreviewUrl || null,
                duration:  items[0]?.mediaDuration || null,
                mp4,
                mp3,
            });
        } catch (err) {
            res.status(500).json({
                status:  false,
                message: err.message,
            });
        }
    });
};
