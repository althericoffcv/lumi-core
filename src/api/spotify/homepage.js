const axios = require('axios');
const cheerio = require('cheerio');

module.exports = function(app) {
    app.get('/homepage/spotify', async (req, res) => {
        try {
            const { data: html } = await axios.get('https://open.spotify.com', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                timeout: 10000,
            });

            const $ = cheerio.load(html);
            const result = {};

            // Loop tiap section/carousel
            $('[data-testid="carousel-mwp"]').each((i, carousel) => {
                // Ambil judul section dari elemen sebelumnya
                const heading = $(carousel).closest('div').prev().find('h2 a, h2').first().text().trim();
                const sectionTitle = heading || `Section ${i + 1}`;

                const items = [];

                $(carousel).find('[data-testid="home-card"]').each((j, card) => {
                    const name = $(card).find('a[data-encore-id="listRowTitle"]').attr('title') ||
                                 $(card).find('a[data-encore-id="listRowTitle"]').text().trim();
                    const thumbnail = $(card).find('img').attr('src');
                    const href = $(card).find('a[data-encore-id="listRowTitle"]').attr('href');
                    const url = href ? `https://open.spotify.com${href}` : null;

                    if (name && thumbnail) {
                        items.push({ name, thumbnail, url });
                    }
                });

                if (items.length > 0) {
                    result[sectionTitle] = items;
                }
            });

            const sections = Object.keys(result);

            if (sections.length === 0) {
                return res.status(502).json({
                    status: false,
                    message: 'Gagal parse konten Spotify. Mungkin struktur HTML berubah.',
                });
            }

            res.json({
                status: true,
                source: 'https://open.spotify.com',
                total_sections: sections.length,
                data: result,
            });

        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });
};
