const axios = require("axios");

module.exports = (app) => {
  app.get("/debug/otakudesu", async (req, res) => {
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
              "id-ID,id;q=0.9,en-US;q=0.8"
          },
          timeout: 15000
        }
      );

      res.json({
        status: true,
        code: response.status,
        html: response.data.substring(0, 3000)
      });

    } catch (err) {
      res.json({
        status: false,
        code: err.response?.status || null,
        url: err.config?.url || null,
        server: err.response?.headers?.server || null,
        cf_ray: err.response?.headers?.["cf-ray"] || null,
        html: String(err.response?.data || "").substring(0, 3000)
      });
    }
  });
};