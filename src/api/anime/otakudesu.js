const axios = require("axios");
const cheerio = require("cheerio");

module.exports = (app) => {
  app.get("/search/otakudesu", async (req, res) => {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({
          status: false,
          message: "Masukkan parameter q"
        });
      }

      const response = await axios.get(
        `https://otakudesu.cloud/?s=${encodeURIComponent(q)}&post_type=anime`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8"
          },
          timeout: 15000
        }
      );

      const $ = cheerio.load(response.data);

      let results = [];

      $(".chivsrc li").each((i, el) => {
        results.push({
          title: $(el).find("h2 a").text().trim(),
          url: $(el).find("h2 a").attr("href"),
          thumbnail: $(el).find("img").attr("src")
        });
      });

      res.json({
        status: true,
        result: results
      });

    } catch (err) {
      res.status(500).json({
        status: false,
        error: err.message,
        code: err.response?.status || null
      });
    }
  });
};