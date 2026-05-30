const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://otakudesu.cloud";
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;

const defaultHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
  "Referer": BASE_URL,
};

const fetchHTML = async (url) => {
  const { data } = await axios.get(url, { headers: defaultHeaders, timeout: 15000 });
  return cheerio.load(data);
};

module.exports = (app) => {

  // GET /otakudesu/home
  app.get("/otakudesu/home", async (req, res) => {
    try {
      const $ = await fetchHTML(`${BASE_URL}/`);
      const result = [];
      $(".venz ul li").each((_, el) => {
        const title = $(el).find("h2.jdlflm").first().text().trim();
        const thumbnail = $(el).find(".thumbz img").attr("src");
        const url = $(el).find(".thumb a").attr("href");
        const episode = $(el).find(".epz").text().replace(/\s+/g, " ").trim();
        const day = $(el).find(".epztipe").text().replace(/\s+/g, " ").trim();
        const release = $(el).find(".newnime").text().trim();
        if (title) result.push({ title, thumbnail, url, episode, day, release });
      });
      res.json({ status: true, total: result.length, result });
    } catch (err) {
      res.status(500).json({ status: false, error: err.message, code: err.response?.status || null });
    }
  });

  // GET /otakudesu/anime-list
  app.get("/otakudesu/anime-list", async (req, res) => {
    try {
      const $ = await fetchHTML(`${BASE_URL}/anime-list/`);
      const result = [];
      $(".hodebgst").each((_, el) => {
        result.push({
          title: $(el).contents().first().text().trim(),
          url: $(el).attr("href"),
          status: $(el).text().includes("On-Going") ? "On-Going" : "Completed",
        });
      });
      res.json({ status: true, total: result.length, result });
    } catch (err) {
      res.status(500).json({ status: false, error: err.message, code: err.response?.status || null });
    }
  });

  // GET /otakudesu/genre-list
  app.get("/otakudesu/genre-list", async (req, res) => {
    try {
      const $ = await fetchHTML(`${BASE_URL}/genre-list/`);
      const result = [];
      $(".genres a").each((_, el) => {
        result.push({
          name: $(el).text().trim(),
          url: new URL($(el).attr("href"), BASE_URL).href,
        });
      });
      res.json({ status: true, total: result.length, result });
    } catch (err) {
      res.status(500).json({ status: false, error: err.message, code: err.response?.status || null });
    }
  });

  // GET /otakudesu/jadwal
  app.get("/otakudesu/jadwal", async (req, res) => {
    try {
      const $ = await fetchHTML(`${BASE_URL}/jadwal-rilis/`);
      const result = {};
      $(".kglist321").each((_, el) => {
        const day = $(el).find("h2").first().text().trim();
        const list = [];
        $(el).find("ul li a").each((_, a) => {
          list.push({ title: $(a).text().trim(), url: $(a).attr("href") });
        });
        if (day && list.length) result[day] = list;
      });
      res.json({ status: true, result });
    } catch (err) {
      res.status(500).json({ status: false, error: err.message, code: err.response?.status || null });
    }
  });

  // GET /otakudesu/episode?url=
  app.get("/otakudesu/episode", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url) return res.status(400).json({ status: false, message: "Masukkan parameter url" });

      const $ = await fetchHTML(url);
      const title = $("h1.posttl").text().trim();
      const metaSpans = $(".kategoz span");
      const postedBy = metaSpans.eq(0).text().trim();
      const releasedAt = metaSpans.eq(1).text().trim();

      const episodeList = [];
      $("#selectcog option").each((_, el) => {
        const val = $(el).val();
        const label = $(el).text().trim();
        if (val && val !== "0") episodeList.push({ label, url: val });
      });

      const navLinks = $(".prevnext .flir a");
      const seeAllUrl = navLinks.eq(0).attr("href") || null;
      const nextEpUrl = navLinks.eq(1).attr("href") || null;

      const mirrors = [];
      $(".mirrorstream ul").each((_, ulEl) => {
        const qualityClass = $(ulEl).attr("class") || "";
        const quality = qualityClass.replace(/[^0-9p]/g, "") || qualityClass;
        const servers = [];
        $(ulEl).find("li a").each((_, aEl) => {
          const serverName = $(aEl).text().trim();
          const dataContent = $(aEl).attr("data-content") || null;
          let decoded = null;
          if (dataContent) {
            try { decoded = JSON.parse(Buffer.from(dataContent, "base64").toString("utf-8")); } catch {}
          }
          servers.push({ serverName, dataContent, decoded });
        });
        if (servers.length) mirrors.push({ quality, servers });
      });

      const downloads = [];
      $(".download ul").each((_, ulEl) => {
        $(ulEl).find("li").each((_, liEl) => {
          const quality = $(liEl).find("strong").text().trim();
          const size = $(liEl).find("i").text().trim();
          const links = [];
          $(liEl).find("a").each((_, aEl) => {
            links.push({ host: $(aEl).text().trim(), url: $(aEl).attr("href") || null });
          });
          if (quality) downloads.push({ quality, size, links });
        });
      });

      const info = {};
      $(".cukder .infozingle p").each((_, pEl) => {
        const text = $(pEl).text().trim();
        const colonIdx = text.indexOf(":");
        if (colonIdx === -1) return;
        const key = text.slice(0, colonIdx).trim().toLowerCase();
        const value = text.slice(colonIdx + 1).trim();
        if (key === "genres") {
          info.genres = $(pEl).find("a").map((_, a) => $(a).text().trim()).get();
        } else {
          info[key] = value;
        }
      });
      info.thumbnail = $(".cukder img").first().attr("src") || null;
      info.detailUrl = $(".prevnext .flir a").first().attr("href") || null;

      res.json({
        status: true,
        result: { title, url, postedBy, releasedAt, episodeList, navigation: { seeAllUrl, nextEpUrl }, mirrors, downloads, info },
      });
    } catch (err) {
      res.status(500).json({ status: false, error: err.message, code: err.response?.status || null });
    }
  });

  // GET /otakudesu/stream?id=&i=&q=
  app.get("/otakudesu/stream", async (req, res) => {
    try {
      const { id, i, q } = req.query;
      if (!id || i === undefined || !q) {
        return res.status(400).json({ status: false, message: "Masukkan parameter: id, i, q" });
      }

      const ajaxHeaders = { ...defaultHeaders, "Content-Type": "application/x-www-form-urlencoded" };

      const nonceParams = new URLSearchParams();
      nonceParams.append("action", "aa1208d27f29ca340c92c66d1926f13f");
      const nonceRes = await axios.post(AJAX_URL, nonceParams.toString(), { headers: ajaxHeaders });
      const nonce = nonceRes.data.data;

      const streamParams = new URLSearchParams();
      streamParams.append("id", id);
      streamParams.append("i", i);
      streamParams.append("q", q);
      streamParams.append("nonce", nonce);
      streamParams.append("action", "2a3505c93b0035d3f455df82bf976b84");

      const streamRes = await axios.post(AJAX_URL, streamParams.toString(), { headers: ajaxHeaders });
      const html = Buffer.from(streamRes.data.data, "base64").toString("utf-8");
      const $ = cheerio.load(html);
      const iframeSrc = $("iframe").attr("src") || null;

      res.json({ status: true, result: { nonce, embedHtml: html, iframeSrc } });
    } catch (err) {
      res.status(500).json({ status: false, error: err.message, code: err.response?.status || null });
    }
  });

};
