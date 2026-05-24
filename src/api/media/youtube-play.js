const yts   = require('yt-search');
const axios = require('axios');

const DL_URL = 'https://app.ytdown.to/proxy.php';

const DL_HEADERS = {
    'User-Agent':       'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept':           '*/*',
    'Accept-Language':  'en-US,en;q=0.9',
    'Origin':           'https://app.ytdown.to',
    'Referer':          'https://app.ytdown.to/',
    'X-Requested-With': 'XMLHttpRequest',
};

async function searchFirst(query) {
    const r = await yts(query);
    const video = r.videos[0];
    if (!video) throw new Error(`Tidak ada hasil YouTube untuk "${query}"`);
    return video;
}

async function getDownloadLinks(ytUrl) {
    const body = new URLSearchParams({ url: ytUrl }).toString();
    const { data } = await axios.post(DL_URL, body, {
        headers: DL_HEADERS,
        timeout: 30000,
    });

    const api   = data?.api || {};
    const items = api.mediaItems || [];
    if (!items.length) throw new Error('Gagal mendapatkan link download.');

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
            quality:  i.mediaQuality,
            format:   i.mediaExtension,
            url:      i.mediaUrl,
            size:     i.mediaFileSize || null,
            duration: i.mediaDuration || null,
        }));

    return {
        title:     api.title || null,
        thumbnail: api.imagePreviewUrl || null,
        duration:  items[0]?.mediaDuration || null,
        mp4,
        mp3,
    };
}

module.exports = function(app) {
    app.get('/media/ytplay', async (req, res) => {
        const { q } = req.query;

        if (!q) return res.status(400).json({
            status: false,
            message: "Parameter 'q' wajib diisi! Contoh: /media/ytplay?q=faded+alan+walker",
        });

        try {
            const video = await searchFirst(q);
            const dl    = await getDownloadLinks(video.url);

            res.json({
                status: true,
                query:  q,
                video: {
                    videoId:   video.videoId,
                    title:     dl.title || video.title,
                    url:       video.url,
                    thumbnail: dl.thumbnail || video.thumbnail,
                    duration:  dl.duration  || video.timestamp,
                    views:     video.views,
                    ago:       video.ago,
                    author: {
                        name: video.author?.name,
                        url:  video.author?.url,
                    },
                },
                mp4: dl.mp4,
                mp3: dl.mp3,
            });
        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });
};
