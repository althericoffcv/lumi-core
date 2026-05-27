const fs   = require('fs');
const path = require('path');

const SUPABASE_PROJECT = 'fnlfrdinxtwkhzbmyawv';
const CHAT_ENDPOINT    = `https://${SUPABASE_PROJECT}.supabase.co/functions/v1/openrouter-chat`;
const DEEPSEEK_ORIGIN  = 'https://deepseek.ai';
const TOKEN_CACHE_FILE = path.join(__dirname, '.dstoken');

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

function decodeJWT(token) {
  try {
    const fix = s => s.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(fix(token.split('.')[1]), 'base64').toString());
  } catch { return null; }
}

function isValidAnonKey(token) {
  const p = decodeJWT(token);
  return p && p.iss === 'supabase' && p.ref === SUPABASE_PROJECT && p.role === 'anon';
}

function loadCache() {
  try {
    if (!fs.existsSync(TOKEN_CACHE_FILE)) return null;
    const { token } = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
    const p = decodeJWT(token);
    if (!p || Date.now() > p.exp * 1000) { fs.unlinkSync(TOKEN_CACHE_FILE); return null; }
    return token;
  } catch { return null; }
}

function saveCache(token) {
  try { fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({ token })); } catch {}
}

async function fetchToken() {
  const jwtRe   = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g;
  const headers = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' };

  let html;
  try {
    const r = await fetch(DEEPSEEK_ORIGIN, { headers: { ...headers, Accept: 'text/html,*/*' } });
    html = await r.text();
  } catch { return null; }

  for (const tk of (html.match(jwtRe) || [])) {
    if (isValidAnonKey(tk)) return tk;
  }

  const scriptRe = /<script[^>]+src=["']([^"'>]+\.js[^"'>]*)["']/gi;
  const urls = [];
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const s = m[1];
    urls.push(s.startsWith('http') ? s : DEEPSEEK_ORIGIN + s);
  }

  const prio = urls.filter(s => /\/(index|main|app|_app|entry|chunk)[^/]*\.js/.test(s));
  const rest  = urls.filter(s => !prio.includes(s));

  for (const url of [...prio, ...rest].slice(0, 20)) {
    try {
      const r  = await fetch(url, { headers: { ...headers, Accept: '*/*', Referer: DEEPSEEK_ORIGIN + '/' } });
      const js = await r.text();
      for (const tk of (js.match(jwtRe) || [])) {
        if (isValidAnonKey(tk)) return tk;
      }
    } catch {}
  }

  return null;
}

async function resolveToken() {
  const cached = loadCache();
  if (cached) return cached;
  const token = await fetchToken();
  if (token) { saveCache(token); return token; }
  return null;
}

async function chat(token, messages) {
  const upstream = await fetch(CHAT_ENDPOINT, {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': 'Bearer ' + token,
      'Accept'       : '*/*',
      'Origin'       : DEEPSEEK_ORIGIN,
      'Referer'      : DEEPSEEK_ORIGIN + '/',
      'User-Agent'   : UA,
    },
    body: JSON.stringify({ messages }),
  });

  if (!upstream.ok) {
    if (upstream.status === 401) {
      try { fs.unlinkSync(TOKEN_CACHE_FILE); } catch {}
    }
    throw new Error('Upstream HTTP ' + upstream.status);
  }

  return upstream;
}

async function collectStream(upstream) {
  const decoder = new TextDecoder();
  const reader  = upstream.body.getReader();
  let buf = '', full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const raw = t.slice(5).trim();
      if (raw === '[DONE]') break;
      try {
        const delta = JSON.parse(raw)?.choices?.[0]?.delta;
        if (delta?.content) full += delta.content;
      } catch {}
    }
  }

  return full;
}

module.exports = function(app) {

  // GET /ai/deepseek?text=...
  app.get('/ai/deepseek', async (req, res) => {
    const text   = req.query.text?.trim();
    const stream = req.query.stream === 'true';

    if (!text) return res.status(400).json({
      status : false,
      message: "Parameter 'text' wajib diisi! Contoh: /ai/deepseek?text=halo"
    });

    try {
      const token = await resolveToken();
      if (!token) throw new Error('Gagal mendapatkan token');

      const messages = [{ role: 'user', content: text }];
      const upstream = await chat(token, messages);

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const decoder = new TextDecoder();
        const reader  = upstream.body.getReader();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) res.write(line + '\n');
        }
        return res.end();
      }

      const result = await collectStream(upstream);
      return res.json({
        status  : true,
        category: 'Artificial Intelligence',
        query   : text,
        data    : {
          author  : 'DeepSeek',
          response: result
        }
      });

    } catch (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
  });

  // POST /ai/deepseek  body: { text } atau { messages: [...] }
  app.post('/ai/deepseek', async (req, res) => {
    const stream = req.query.stream === 'true' || req.body.stream === true;

    let messages = req.body.messages;
    if (!messages && req.body.text) messages = [{ role: 'user', content: req.body.text }];
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({
      status : false,
      message: "Body harus berisi 'messages' array atau 'text' string"
    });

    try {
      const token = await resolveToken();
      if (!token) throw new Error('Gagal mendapatkan token');

      const upstream = await chat(token, messages);

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const decoder = new TextDecoder();
        const reader  = upstream.body.getReader();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) res.write(line + '\n');
        }
        return res.end();
      }

      const result = await collectStream(upstream);
      return res.json({
        status  : true,
        category: 'Artificial Intelligence',
        query   : messages.at(-1)?.content || '',
        data    : {
          author  : 'DeepSeek',
          response: result
        }
      });

    } catch (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
  });

};
