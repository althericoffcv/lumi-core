module.exports = function(app) {

    async function searchTiktok(keyword, count = 10, cursor = 0) {
        const res = await fetch('https://www.tikwm.com/api/feed/search', {
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

        if (!res.ok) throw new Error(`Request gagal: HTTP ${res.status}`);

        const json = await res.json();
        if (json.code !== 0) throw new Error(json.msg || 'Gagal mengambil data dari TikTok.');

        const BASE = 'https://www.tikwm.com';

        return {
            cursor: json.data.cursor,
            hasMore: json.data.hasMore,
            videos: (json.data.videos || []).map(v => ({
                id: v.id,
                title: v.title || '',
                region: v.region || null,
                duration: v.duration,
                cover: v.cover ? BASE + v.cover : null,
                play: v.play ? BASE + v.play : null,
                play_count: v.play_count || 0,
                digg_count: v.digg_count || 0,
                comment_count: v.comment_count || 0,
                share_count: v.share_count || 0,
                download_count: v.download_count || 0,
                collect_count: v.collect_count || 0,
                create_time: v.create_time || null,
                music: v.music_info ? {
                    id: v.music_info.id,
                    title: v.music_info.title,
                    author: v.music_info.author,
                    duration: v.music_info.duration,
                    url: v.music_info.play || null
                } : null,
                author: v.author ? {
                    id: v.author.id,
                    username: v.author.unique_id,
                    nickname: v.author.nickname,
                    avatar: v.author.avatar ? BASE + v.author.avatar : null
                } : null
            }))
        };
    }

    app.get('/search/tiktok', async (req, res) => {
        const { q, count, cursor } = req.query;

        if (!q) return res.status(400).json({
            status: false,
            message: "Parameter 'q' wajib diisi! Contoh: /search/tiktok?q=anime"
        });

        const limitCount = Math.min(parseInt(count) || 10, 30);
        const cursorVal  = parseInt(cursor) || 0;

        try {
            const result = await searchTiktok(q, limitCount, cursorVal);
            res.json({
                status: true,
                query: q,
                total: result.videos.length,
                cursor: result.cursor,
                hasMore: result.hasMore,
                data: result.videos
            });
        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });
};
