'use strict';

const axios = require('axios');

// ─── Config ────────────────────────────────────────────────────────────────
const CONFIG = {
  email   : '0m6so2ldo2@wshu.net',
  password: 'Axolt123',
  model   : 'gpt3',
};

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

// ─── Cookie Jar ─────────────────────────────────────────────────────────────
class CookieJar {
  constructor() { this.store = {}; }
  update(raw) {
    if (!raw) return;
    const list = Array.isArray(raw) ? raw : [raw];
    list.forEach(h => {
      const eq = h.indexOf('='), semi = h.indexOf(';');
      if (eq < 0) return;
      this.store[h.slice(0, eq).trim()] = (semi > eq ? h.slice(eq + 1, semi) : h.slice(eq + 1)).trim();
    });
  }
  toString() { return Object.entries(this.store).map(([k, v]) => `${k}=${v}`).join('; '); }
  get(k) { return this.store[k]; }
}

// ─── Session State ───────────────────────────────────────────────────────────
let session = {
  jar        : new CookieJar(),
  csrf       : '',
  uid        : '',
  chatId     : '',
  ready      : false,
  initializing: false,
};

// ─── HTTP Helpers ────────────────────────────────────────────────────────────
function baseH() {
  return {
    'User-Agent'      : UA,
    'Accept-Language' : 'en-US,en;q=0.9',
    'sec-ch-ua'       : '"Chromium";v="139", "Not;A=Brand";v="99"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'X-Requested-With': 'XMLHttpRequest',
  };
}

function buildH(extra = {}) {
  return { ...baseH(), Cookie: session.jar.toString(), 'X-CSRF-TOKEN': session.csrf, ...extra };
}

async function httpGet(path, referer) {
  const res = await axios.get(`https://chatx.ai${path}`, {
    headers: { ...baseH(), Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', Cookie: session.jar.toString(), ...(referer ? { Referer: referer } : {}) },
    maxRedirects: 10,
    validateStatus: () => true,
  });
  session.jar.update(res.headers['set-cookie']);
  return res;
}

async function httpPost(path, body, referer, acceptHtml = false) {
  const res = await axios.post(`https://chatx.ai${path}`,
    typeof body === 'string' ? body : new URLSearchParams(body).toString(),
    {
      headers: buildH({
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept        : acceptHtml ? 'text/html, */*; q=0.01' : 'application/json, text/javascript, */*; q=0.01',
        Origin        : 'https://chatx.ai',
        Referer       : referer || 'https://chatx.ai/gpt',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      }),
      validateStatus: () => true,
    }
  );
  session.jar.update(res.headers['set-cookie']);
  return res.data;
}

// ─── Parse Helpers ───────────────────────────────────────────────────────────
function parseCSRF(html) {
  const m = html.match(/meta[^>]+name="csrf-token"[^>]+content="([^"]+)"/);
  return m ? m[1] : '';
}

function parseUID(html) {
  for (const p of [
    /['"](user_id|userId)['"]\s*[:=]\s*'?"?(\d{9,})/,
    /user_id\s*=\s*(\d{9,})/,
    /\/gettoken\?user_id=(\d{9,})/,
    /data-user[_-]id="(\d{9,})"/,
    /userId['":\s]+(\d{9,})/,
  ]) {
    const m = html.match(p);
    if (m) return m[m.length - 1];
  }
  return '';
}

// ─── Session Init ────────────────────────────────────────────────────────────
async function initSession() {
  // CSRF
  const r1 = await httpGet('/');
  let token = parseCSRF(r1.data);
  if (!token) {
    const r2 = await httpGet('/gpt', 'https://chatx.ai/');
    token = parseCSRF(r2.data);
  }
  if (!token) {
    const xsrf = session.jar.get('XSRF-TOKEN');
    if (xsrf) token = decodeURIComponent(xsrf);
  }
  if (!token) throw new Error('CSRF tidak ditemukan');
  session.csrf = token;

  // Login
  const login = await httpPost('/apilogin', { email: CONFIG.email, password: CONFIG.password });
  if (!login.response) throw new Error(login.message || 'Login gagal');

  const slug = login.route_slug || 'gpt';
  const r = await httpGet(`/${slug}`, 'https://chatx.ai/gpt');
  const html = r.data;

  const nc = parseCSRF(html);
  if (nc) session.csrf = nc;

  session.uid = parseUID(html);
  if (!session.uid) throw new Error('user_id tidak ditemukan');

  // Resolve chatId
  const conv = await httpPost('/openconversions', '', 'https://chatx.ai/gpt');
  if (conv.response && conv.chats && conv.chats.id) {
    session.chatId = String(conv.chats.id);
  } else {
    // Buat chat baru via /newchat, parse openconversions('ID') dari HTML
    const newchatHtml = await httpPost('/newchat', { user_id: session.uid }, 'https://chatx.ai/gpt', true);
    const htmlStr = typeof newchatHtml === 'string' ? newchatHtml : JSON.stringify(newchatHtml);
    const nc2 = parseCSRF(htmlStr);
    if (nc2) session.csrf = nc2;
    const m = htmlStr.match(/openconversions\('(\d+)'\)/);
    if (m) session.chatId = m[1];
  }

  if (!session.chatId) throw new Error('Gagal mendapatkan chatId');

  // Set model
  const mdl = await httpPost('/user_model', { model: CONFIG.model, user_id: session.uid }, 'https://chatx.ai/gpt');
  if (!mdl.response) throw new Error('Gagal set model');

  session.ready = true;
}

async function ensureSession() {
  if (session.ready) return;
  if (session.initializing) {
    // Tunggu sampai selesai
    await new Promise(resolve => {
      const t = setInterval(() => { if (!session.initializing) { clearInterval(t); resolve(); } }, 100);
    });
    return;
  }
  session.initializing = true;
  try {
    await initSession();
  } finally {
    session.initializing = false;
  }
}

// ─── Send & Stream ───────────────────────────────────────────────────────────
async function sendMsg(text) {
  const body = {
    prompt            : text,
    model             : CONFIG.model,
    user_id           : session.uid,
    chats_id          : session.chatId,
    g_recaptcha_response: '',
    is_web            : '0',
    is_youtube        : '0',
  };

  const data = await httpPost('/sendchat', body, 'https://chatx.ai/gpt');
  if (!data.response) throw new Error('sendchat gagal: ' + JSON.stringify(data).slice(0, 200));

  return { cid: data.conversions_id, acid: data.ass_conversions_id };
}

async function collectStream(cid, acid) {
  const url = new URL('https://chatx.ai/chats_stream');
  [
    ['user_id', session.uid], ['chats_id', session.chatId], ['current_model', CONFIG.model],
    ['conversions_id', cid], ['ass_conversions_id', acid],
    ['g_recaptcha_response', ''], ['is_web', '0'], ['is_youtube', '0'],
    ['reasoning_effort', 'low'], ['verbosity', 'low'],
  ].forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await axios.get(url.toString(), {
    headers: buildH({
      Accept          : 'text/event-stream',
      'Cache-Control' : 'no-cache',
      Referer         : 'https://chatx.ai/gpt',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    }),
    responseType  : 'stream',
    validateStatus: () => true,
  });

  session.jar.update(res.headers['set-cookie']);

  return new Promise((resolve, reject) => {
    let full = '', done = false, eventType = 'message';

    res.data.on('data', chunk => {
      chunk.toString().split('\n').forEach(line => {
        if (line.startsWith('event:')) { eventType = line.slice(6).trim(); return; }
        if (line.trim() === '') { eventType = 'message'; return; }
        if (!line.startsWith('data:')) return;

        const raw = line.slice(5).trim();
        if (!raw) return;

        if (raw === 'end' || raw === '[DONE]' || eventType === 'done') {
          if (!done) { done = true; resolve(full); }
          return;
        }

        try {
          const j = JSON.parse(raw);
          if (j.type === 'response.output_text.delta' && j.delta) full += j.delta;
        } catch (_) {}
      });
    });

    res.data.on('end', () => { if (!done) resolve(full); });
    res.data.on('error', reject);
  });
}

// ─── Route ───────────────────────────────────────────────────────────────────
module.exports = function(app) {

  // GET /ai/lumi?text=halo
  app.get('/ai/lumi', async (req, res) => {
    const text = req.query.text?.trim();
    if (!text) return res.status(400).json({
      status : false,
      message: "Parameter 'text' wajib diisi! Contoh: /ai/lumi?text=halo"
    });

    try {
      await ensureSession();
      const { cid, acid } = await sendMsg(text);
      const response      = await collectStream(cid, acid);

      return res.json({
        status  : true,
        category: 'Artificial Intelligence',
        query   : text,
        data    : {
          author  : 'Lumi',
          response,
        }
      });
    } catch (err) {
      // Reset session jika error agar auto re-login di request berikutnya
      session.ready = false;
      return res.status(500).json({ status: false, message: err.message });
    }
  });

  // POST /ai/lumi  body: { text } atau { messages: [...] }
  app.post('/ai/lumi', async (req, res) => {
    let text = req.body.text?.trim();
    if (!text && Array.isArray(req.body.messages)) {
      text = req.body.messages.at(-1)?.content?.trim();
    }
    if (!text) return res.status(400).json({
      status : false,
      message: "Body harus berisi 'text' string atau 'messages' array"
    });

    try {
      await ensureSession();
      const { cid, acid } = await sendMsg(text);
      const response      = await collectStream(cid, acid);

      return res.json({
        status  : true,
        category: 'Artificial Intelligence',
        query   : text,
        data    : {
          author  : 'Lumi',
          response,
        }
      });
    } catch (err) {
      session.ready = false;
      return res.status(500).json({ status: false, message: err.message });
    }
  });

};
