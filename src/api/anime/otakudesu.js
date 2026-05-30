const axios = require("axios");
const cheerio = require("cheerio");

module.exports = (app) => {
  app.get("/home/otakudesu", async (req, res) => {
    try {
      const response = await axios.get(
        "https://otakudesu.cloud/",
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language":
              "id-ID,id;q=0.9,en-US;q=0.8"
          },
          timeout: 15000
        }
      );

      const $ = cheerio.load(response.data);

      const ongoing = [];
      const completed = [];

      $(".venz ul li").each((i, el) => {
        ongoing.push({
          title: $(el).find(".thumbz h2").text().trim(),
          url: $(el).find(".thumb a").attr("href"),
          thumbnail: $(el).find("img").attr("src"),
          episode: $(el).find(".epz").text().trim(),
          date: $(el).find(".newnime").text().trim()
        });
      });

      $(".venser ul li").each((i, el) => {
        completed.push({
          title: $(el).find("h2").text().trim(),
          url: $(el).find("a").attr("href"),
          thumbnail: $(el).find("img").attr("src")
        });
      });

      res.json({
        status: true,
        result: {
          ongoing,
          completed
        }
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