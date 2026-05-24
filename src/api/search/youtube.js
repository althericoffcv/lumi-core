const yts = require('yt-search');

module.exports = function (app) {
    app.get('/search/youtube', async (req, res) => {
        const { q } = req.query;

        if (!q) return res.status(400).json({
            status:  false,
            message: "Parameter 'q' wajib diisi! Contoh: /search/youtube?q=superman+theme",
        });

        try {
            const r = await yts(q);
            const data = r.videos.slice(0, 10).map(v => ({
                videoId:   v.videoId,
                title:     v.title,
                url:       v.url,
                thumbnail: v.thumbnail,
                duration:  v.timestamp,
                views:     v.views,
                ago:       v.ago,
                author: {
                    name: v.author?.name,
                    url:  v.author?.url,
                },
            }));

            res.json({
                status: true,
                query:  q,
                total:  data.length,
                data,
            });
        } catch (err) {
            res.status(500).json({
                status:  false,
                message: err.message,
            });
        }
    });
};
