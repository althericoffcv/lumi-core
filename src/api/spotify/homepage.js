const axios = require('axios');
const cheerio = require('cheerio');

module.exports = function(app) {
    app.get('/homepage/spotify', async (req, res) => {
        try {
            const { data: html } = await axios.get('https://open.spotify.com', {
                timeout: 10000,
            });

            const $ = cheerio.load(html);
            const result = {};

            $('[data-testid="carousel-mwp"]').each((i, el) => {
                // Heading ada di sibling sebelumnya (.l27FSrHNngAw2rXG > h2)
                const headingEl = $(el).prev();
                const heading = headingEl.find('h2').text().trim() || `Section ${i + 1}`;

                const items = [];

                $(el).find('[data-testid="home-card"]').each((j, card) => {
                    const anchor = $(card).find('a[data-encore-id="listRowTitle"]');
                    const name = anchor.attr('title') || anchor.text().trim();
                    const thumbnail = $(card).find('img').attr('src');
                    const href = anchor.attr('href');
                    const url = href ? `https://open.spotify.com${href}` : null;

                    if (name && thumbnail) {
                        items.push({ name, thumbnail, url });
                    }
                });

                if (items.length > 0) {
                    result[heading] = items;
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
