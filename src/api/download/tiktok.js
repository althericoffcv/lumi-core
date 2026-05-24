
module.exports = function(app) {

    function isTiktok(url) {
        if (!url) return false;
        return /^https?:\/\/((?:www|vm|vt|m)\.)?tiktok\.com\/.+/.test(url.trim());
    }

    async function tt(url) {
        const html = await fetch(url, {
            headers: {
                authority: 'www.tiktok.com',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
            }
        }).then(r => r.text());

        const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
        if (!match) throw new Error('Gagal mengambil data dari TikTok. URL mungkin tidak valid atau konten sudah dihapus.');

        let json;
        try {
            json = JSON.parse(match[1]);
        } catch (e) {
            throw new Error('Gagal parse data TikTok: ' + e.message);
        }

        const scope = json.__DEFAULT_SCOPE__;
        if (!scope || !scope['webapp.reflow.video.detail']) {
            throw new Error('Struktur data TikTok berubah atau konten tidak tersedia.');
        }

        const data = scope['webapp.reflow.video.detail'].itemInfo.itemStruct;

        let download;
        const isSlideshow = !!data.imagePost;

        if (isSlideshow) {
            download = data.imagePost.images.reduce((acc, img) => {
                return acc.concat(img.imageURL.urlList);
            }, []);
        } else {
            try {
                const videoRes = await fetch(
                    `https://www.tiktok.com/player/api/v1/items?item_ids=${data.id}`
                ).then(r => r.json());
                download = videoRes.items[0].video_info.url_list[0];
            } catch (e) {
                // fallback ke download URL langsung dari data
                download = data.video?.downloadAddr || data.video?.playAddr || null;
            }
        }

        return {
            id: data.id || data.aweme_id || null,
            like: data.stats?.diggCount || 0,
            views: data.stats?.playCount || data.play || 0,
            share: data.stats?.shareCount || 0,
            comment: data.stats?.commentCount || 0,
            isVideo: !isSlideshow,
            title: data.desc || data.suggestedWords?.[0] || '',
            region: data.locationCreated || null,
            duration: `${data.duration || data.music?.duration || 0} second`,
            download,
            author: {
                id: data.author?.id || '',
                avatar: data.author?.avatarThumb || null,
                nickname: data.author?.nickname || '',
                username: data.author?.uniqueId || '',
                followers: data.author?.followerCount || 0,
                following: data.author?.followingCount || 0,
                like: data.author?.heartCount || 0,
                verified: data.author?.verified || false,
                videoCount: data.author?.videoCount || 0
            },
            music: {
                id: data.music?.id || null,
                title: data.music?.title || '',
                author: data.music?.authorName || '',
                thumbnail: data.music?.coverLarge || data.music?.coverMedium || data.music?.coverThumb || null,
                duration: data.music?.duration ? `${data.music.duration} second` : '',
                url: data.music?.playUrl || null
            }
        };
    }

    // ─── ENDPOINT ───────────────────────────────────────────────────────────────

    /**
     * ENDPOINT: GET /downloader/tiktok?url=https://www.tiktok.com/@user/video/xxx
     * Desc: Download video atau slideshow dari TikTok
     */
    app.get('/downloader/tiktok', async (req, res) => {
        const { url } = req.query;

        if (!url) return res.status(400).json({
            status: false,
            message: "Parameter 'url' wajib diisi! Contoh: /downloader/tiktok?url=https://www.tiktok.com/@user/video/xxx"
        });

        if (!isTiktok(url)) return res.status(400).json({
            status: false,
            message: 'URL bukan TikTok yang valid. Pastikan URL berasal dari tiktok.com'
        });

        try {
            const result = await tt(url);

            if (!result) return res.status(404).json({
                status: false,
                message: 'Konten TikTok tidak ditemukan atau sudah dihapus.'
            });

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
