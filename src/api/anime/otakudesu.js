const axios = require("axios");
const cheerio = require("cheerio");
const { HttpsProxyAgent } = require("https-proxy-agent");

const BASE_URL = "https://otakudesu.blog";
const AJAX_URL = "https://otakudesu.blog/wp-admin/admin-ajax.php";

const PROXY_LIST = [
  "31.59.20.176:6754:pdrjpkgm:z7wvu1pyr1re",
  "198.23.239.134:6540:pdrjpkgm:z7wvu1pyr1re",
  "45.38.107.97:6014:pdrjpkgm:z7wvu1pyr1re",
  "107.172.163.27:6543:pdrjpkgm:z7wvu1pyr1re",
  "198.105.121.200:6462:pdrjpkgm:z7wvu1pyr1re",
  "216.10.27.159:6837:pdrjpkgm:z7wvu1pyr1re",
  "142.111.67.146:5611:pdrjpkgm:z7wvu1pyr1re",
  "191.96.254.138:6185:pdrjpkgm:z7wvu1pyr1re",
  "31.58.9.4:6077:pdrjpkgm:z7wvu1pyr1re",
  "23.26.71.145:5628:pdrjpkgm:z7wvu1pyr1re",
];

function getRandomAgent() {
  const proxy = PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
  const [host, port, user, pass] = proxy.split(":");
  return new HttpsProxyAgent(`http://${user}:${pass}@${host}:${port}`);
}

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Referer": BASE_URL,
};

async function fetchHTML(url) {
  const { data } = await axios.get(url, {
    headers,
    httpsAgent: getRandomAgent(),
    timeout: 20000,
  });
  return cheerio.load(data);
}

async function fetchAjax(params) {
  const { data } = await axios.post(AJAX_URL, params.toString(), {
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Origin": BASE_URL,
    },
    httpsAgent: getRandomAgent(),
    timeout: 20000,
  });
  return data;
}

async function getHome() {
  const $ = await fetchHTML(BASE_URL + "/");
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
  return result;
}

async function getOngoing() {
  const $ = await fetchHTML(BASE_URL + "/ongoing-anime/");
  const result = [];
  $(".venz ul li").each((_, el) => {
    const title = $(el).find(".jdlflm").text().trim();
    const thumbnail = $(el).find("img").attr("src");
    const url = $(el).find("a").attr("href");
    const episode = $(el).find(".epz").text().trim();
    const date = $(el).find(".newnime").text().trim();
    if (title) result.push({ title, thumbnail, url, episode, date });
  });
  return result;
}

async function getAnimeList() {
  const $ = await fetchHTML(BASE_URL + "/anime-list/");
  const result = [];
  $(".hodebgst").each((_, el) => {
    result.push({
      title: $(el).contents().first().text().trim(),
      url: $(el).attr("href"),
      status: $(el).text().includes("On-Going") ? "On-Going" : "Completed",
    });
  });
  return result;
}

async function getGenre() {
  const $ = await fetchHTML(BASE_URL + "/genre-list/");
  const result = [];
  $(".genres a").each((_, el) => {
    result.push({
      name: $(el).text().trim(),
      url: new URL($(el).attr("href"), BASE_URL).href,
    });
  });
  return result;
}

async function getJadwal() {
  const $ = await fetchHTML(BASE_URL + "/jadwal-rilis/");
  const result = {};
  $(".kglist321").each((_, el) => {
    const day = $(el).find("h2").first().text().trim();
    const animeList = [];
    $(el).find("ul li a").each((_, anime) => {
      animeList.push({ title: $(anime).text().trim(), url: $(anime).attr("href") });
    });
    if (day && animeList.length) result[day] = animeList;
  });
  return result;
}

async function getEpisode(url) {
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
    if (servers.length > 0) mirrors.push({ quality, servers });
  });

  const downloads = [];
  $(".download").find("ul").each((_, ulEl) => {
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
    const key = text.slice(0, colonIdx).trim();
    const value = text.slice(colonIdx + 1).trim();
    if (key.toLowerCase() === "genres") {
      info.genres = $(pEl).find("a").map((_, a) => $(a).text().trim()).get();
    } else {
      info[key.toLowerCase()] = value;
    }
  });
  info.thumbnail = $(".cukder img").first().attr("src") || null;
  info.detailUrl = $(".prevnext .flir a").first().attr("href") || null;

  return { title, url, postedBy, releasedAt, episodeList, navigation: { seeAllUrl, nextEpUrl }, mirrors, downloads, info };
}

async function getDetail(url) {
  const $ = await fetchHTML(url);
  const title = $(".jdlrx h1").text().replace(/\s*<.*/, "").trim();
  const thumbnail = $(".fotoanime img").first().attr("src") || null;

  const info = {};
  $(".fotoanime .infozingle p").each((_, pEl) => {
    const full = $(pEl).text().trim();
    const colonIdx = full.indexOf(":");
    if (colonIdx === -1) return;
    const key = full.slice(0, colonIdx).trim().toLowerCase();
    const value = full.slice(colonIdx + 1).trim();
    if (key === "genre") {
      info.genres = $(pEl).find("a").map((_, a) => $(a).text().trim()).get();
    } else {
      info[key] = value;
    }
  });

  const synopsis = $(".sinopc").text().trim() || null;

  const episodeList = [];
  $(".episodelist").each((_, divEl) => {
    const sectionTitle = $(divEl).find(".monktit").text().trim();
    if (!sectionTitle.toLowerCase().includes("episode list")) return;
    $(divEl).find("ul li").each((_, liEl) => {
      const aEl = $(liEl).find("span a").first();
      const dateEl = $(liEl).find("span.zeebr");
      episodeList.push({ title: aEl.text().trim(), url: aEl.attr("href") || null, date: dateEl.text().trim() });
    });
  });

  const batch = [];
  $(".episodelist").each((_, divEl) => {
    const sectionTitle = $(divEl).find(".monktit").text().trim();
    if (!sectionTitle.toLowerCase().includes("batch")) return;
    $(divEl).find("ul li").each((_, liEl) => {
      const aEl = $(liEl).find("span a").first();
      const dateEl = $(liEl).find("span.zeebr");
      batch.push({ title: aEl.text().trim(), url: aEl.attr("href") || null, date: dateEl.text().trim() });
    });
  });

  const recommendations = [];
  $(".isi-recommend-anime-series .isi-konten").each((_, el) => {
    const aEl = $(el).find(".judul-anime a");
    const img = $(el).find(".gambar-konten img").first();
    recommendations.push({ title: aEl.text().trim(), url: aEl.attr("href") || null, thumbnail: img.attr("src") || null });
  });

  return { title, url, thumbnail, synopsis, info, episodeList, batch, recommendations };
}

async function getStream(id, i, q) {
  const nonceParams = new URLSearchParams();
  nonceParams.append("action", "aa1208d27f29ca340c92c66d1926f13f");
  const nonceRes = await fetchAjax(nonceParams);
  const nonce = nonceRes.data;

  const streamParams = new URLSearchParams();
  streamParams.append("id", id);
  streamParams.append("i", i);
  streamParams.append("q", q);
  streamParams.append("nonce", nonce);
  streamParams.append("action", "2a3505c93b0035d3f455df82bf976b84");
  const streamRes = await fetchAjax(streamParams);

  const html = Buffer.from(streamRes.data, "base64").toString("utf-8");
  const $ = cheerio.load(html);
  const iframeSrc = $("iframe").attr("src") || null;
  return { iframeSrc, embedHtml: html };
}

module.exports = function (app) {
  app.get("/otakudesu/home", async (req, res) => {
    try { const data = await getHome(); res.json({ status: true, total: data.length, data }); }
    catch (err) { res.status(500).json({ status: false, message: err.message }); }
  });

  app.get("/otakudesu/ongoing", async (req, res) => {
    try { const data = await getOngoing(); res.json({ status: true, total: data.length, data }); }
    catch (err) { res.status(500).json({ status: false, message: err.message }); }
  });

  app.get("/otakudesu/animelist", async (req, res) => {
    try { const data = await getAnimeList(); res.json({ status: true, total: data.length, data }); }
    catch (err) { res.status(500).json({ status: false, message: err.message }); }
  });

  app.get("/otakudesu/genre", async (req, res) => {
    try { const data = await getGenre(); res.json({ status: true, total: data.length, data }); }
    catch (err) { res.status(500).json({ status: false, message: err.message }); }
  });

  app.get("/otakudesu/jadwal", async (req, res) => {
    try { const data = await getJadwal(); res.json({ status: true, data }); }
    catch (err) { res.status(500).json({ status: false, message: err.message }); }
  });

  app.get("/otakudesu/episode", async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ status: false, message: "Parameter 'url' wajib diisi." });
    try { res.json({ status: true, data: await getEpisode(url) }); }
    catch (err) { res.status(500).json({ status: false, message: err.message }); }
  });

  app.get("/otakudesu/detail", async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ status: false, message: "Parameter 'url' wajib diisi." });
    try { res.json({ status: true, data: await getDetail(url) }); }
    catch (err) { res.status(500).json({ status: false, message: err.message }); }
  });

  app.get("/otakudesu/stream", async (req, res) => {
    const { id, i, q } = req.query;
    if (!id || i === undefined || !q) return res.status(400).json({ status: false, message: "Parameter 'id', 'i', 'q' wajib diisi." });
    try { res.json({ status: true, data: await getStream(id, i, q) }); }
    catch (err) { res.status(500).json({ status: false, message: err.message }); }
  });
};
