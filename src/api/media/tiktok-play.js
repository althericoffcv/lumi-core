module.exports = function(app) {

    async function searchAndGetPlay(keyword, count = 5, cursor = 0) {
        // Step 1: search dulu
        const searchRes = await fetch('https://www.tikwm.com/api/feed/search', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
            },
            body: new URLSearchParams({
                keywords: keyword,
                count: String(count),
                cursor: String(cursor),
                web: '1',
                hd: '1'
            })
        });

        if (!searchRes.ok) throw new Error(`Search gagal: HTTP ${searchRes.status}`);
        const searchJson = await searchRes.json();
        if (searchJson.code !== 0) throw new Error(searchJson.msg || 'Gagal search TikTok.');

        const BASE = 'https://www.tikwm.com';
        const videos = searchJson.data.videos || [];

        // Step 2: build hasil dengan link download langsung
        const results = videos.map(v => {
            const playUrl   = v.play   ? BASE + v.play   : null;
            const wmplayUrl = v.wmplay ? BASE + v.wmplay : null;
            const musicUrl  = v.music  ? BASE + v.music  : null;

            return {
                id: v.id,
                title: v.title || '',
                region: v.region || null,
                duration: v.duration,
                cover: v.cover ? BASE + v.cover : null,
                stats: {
                    play: v.play_count || 0,
                    like: v.digg_count || 0,
                    comment: v.comment_count || 0,
                    share: v.share_count || 0,
                    collect: v.collect_count || 0
                },
                download: {
                    video_no_wm: playUrl,      // tanpa watermark
                    video_wm:    wmplayUrl,    // dengan watermark
                    music:       musicUrl      // audio mp3
                },
                music_info: v.music_info ? {
                    title:    v.music_info.title,
                    author:   v.music_info.author,
                    duration: v.music_info.duration,
                    play_url: v.music_info.play || null
                } : null,
                author: v.author ? {
                    username: v.author.unique_id,
                    nickname: v.author.nickname,
                    avatar:   v.author.avatar ? BASE + v.author.avatar : null
                } : null,
                tiktok_url: `https://www.tiktok.com/@${v.author?.unique_id || 'unknown'}/video/${v.id}`
            };
        });

        return {
            cursor:  searchJson.data.cursor,
            hasMore: searchJson.data.hasMore,
            videos:  results
        };
    }

    app.get('/media/ttplay', async (req, res) => {
        const { q, count, cursor } = req.query;

        if (!q) return res.status(400).json({
            status: false,
            message: "Parameter 'q' wajib diisi! Contoh: /media/ttplay?q=anime"
        });

        const limitCount = Math.min(parseInt(count) || 5, 20);
        const cursorVal  = parseInt(cursor) || 0;

        try {
            const result = await searchAndGetPlay(q, limitCount, cursorVal);
            res.json({
                status: true,
                query:   q,
                total:   result.videos.length,
                cursor:  result.cursor,
                hasMore: result.hasMore,
                note:    "Field 'download.video_no_wm' = link video tanpa watermark, 'download.video_wm' = dengan watermark, 'download.music' = audio mp3",
                data:    result.videos
            });
        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });
};
