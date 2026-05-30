const axios = require("axios");
const cheerio = require("cheerio");

module.exports = (app) => {
  app.get("/ongoing/otakudesu", async (req, res) => {
    try {
      const response = await axios.get(
        "https://otakudesu.blog/ongoing-anime/",
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language":
              "id-ID,id;q=0.9,en-US;q=0.8",
            "Referer": "https://otakudesu.blog/"
          },
          timeout: 15000
        }
      );

      const $ = cheerio.load(response.data);
      const result = [];

      $(".venz ul li").each((i, el) => {
        result.push({
          title: $(el).find(".thumbz h2").text().trim(),
          url: $(el).find(".thumb a").attr("href"),
          thumbnail: $(el).find("img").attr("src"),
          episode: $(el).find(".epz").text().trim(),
          date: $(el).find(".newnime").text().trim()
        });
      });

      res.json({
        status: true,
        total: result.length,
        result
      });

    } catch (err) {
      res.status(500).json({
        status: false,
        error: err.message,
        code: err.response?.status || null,
        url: err.config?.url || null
      });
    }
  });
};