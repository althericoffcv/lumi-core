const { randomUUID } = require('crypto');

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

class ChatGPTClient {
  constructor() {
    this.oaiDeviceId = randomUUID();
    this.sessionId = randomUUID();
    this.oaiClientVersion = 'prod-741180aa2b79430e4f3840306c9dd2056745bbfc';
    this.oaiClientBuildNumber = '6911970';
    this.baseConversationUrl = 'https://chatgpt.com/backend-anon/f/conversation';
    this.baseSentinelUrl = 'https://chatgpt.com/backend-anon/sentinel/chat-requirements/prepare';
    this.cookie = null;
  }

  _buildHeaders(extra = {}) {
    return {
      'authority': 'chatgpt.com',
      'accept': '*/*',
      'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'content-type': 'application/json',
      'cookie': this.cookie || '',
      'origin': 'https://chatgpt.com',
      'referer': 'https://chatgpt.com/',
      'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': UA,
      'oai-client-build-number': this.oaiClientBuildNumber,
      'oai-client-version': this.oaiClientVersion,
      'oai-device-id': this.oaiDeviceId,
      'oai-language': 'id-ID',
      'oai-session-id': this.sessionId,
      ...extra,
    };
  }

  async initCookie() {
    const res = await fetch('https://chatgpt.com/', {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
      },
    });
    const setCookie = res.headers.get('set-cookie') || '';
    const cookies = setCookie.split(',').map(c => c.trim().split(';')[0]).join('; ');
    this.cookie = cookies || null;
  }

  async prepareSentinel() {
    const headers = this._buildHeaders({
      'x-openai-target-path': '/backend-anon/sentinel/chat-requirements/prepare',
      'x-openai-target-route': '/backend-anon/sentinel/chat-requirements/prepare',
    });
    const res = await fetch(this.baseSentinelUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p: '' }),
    });
    if (!res.ok) throw new Error(`Sentinel failed: ${res.status}`);
    return res.json();
  }

  async sendMessage(prompt, conversationId = null, parentMessageId = null) {
    const messageId = randomUUID();
    const now = Date.now() / 1000;

    const body = {
      action: 'next',
      messages: [{
        id: messageId,
        author: { role: 'user' },
        create_time: now,
        content: { content_type: 'text', parts: [prompt] },
        metadata: {
          selected_github_repos: [],
          selected_all_github_repos: false,
          serialization_metadata: { custom_symbol_offsets: [] },
        },
      }],
      parent_message_id: parentMessageId || 'client-created-root',
      model: 'auto',
      client_prepare_state: 'sent',
      timezone_offset_min: -420,
      timezone: 'Asia/Jakarta',
      conversation_mode: { kind: 'primary_assistant' },
      enable_message_followups: true,
      system_hints: [],
      supports_buffering: true,
      supported_encodings: ['v1'],
      client_contextual_info: {
        is_dark_mode: false,
        time_since_loaded: 15,
        page_height: 1070,
        page_width: 553,
        pixel_ratio: 1.3,
        screen_height: 1225,
        screen_width: 552,
        app_name: 'chatgpt.com',
      },
      no_auth_ad_preferences: {
        personalization_enabled: true,
        history_enabled: true,
        bazaar_consent_set: false,
      },
      paragen_cot_summary_display_override: 'allow',
      force_parallel_switch: 'auto',
    };

    if (conversationId) body.conversation_id = conversationId;

    const headers = this._buildHeaders({
      'accept': 'text/event-stream',
      'x-openai-target-path': '/backend-api/f/conversation',
      'x-openai-target-route': '/backend-api/f/conversation',
      'x-oai-turn-trace-id': randomUUID(),
    });

    const res = await fetch(this.baseConversationUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`ChatGPT error: ${res.status} - ${errText.slice(0, 200)}`);
    }

    return this._parseSSE(res);
  }

  async _parseSSE(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let conversationId = null;
    let assistantMessageId = null;
    let currentEventType = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) { currentEventType = line.slice(7).trim(); continue; }
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') return { text: fullText, conversationId, assistantMessageId };
          try {
            const obj = JSON.parse(dataStr);
            if (obj.type === 'resume_conversation_token') conversationId = obj.conversation_id;
            if (obj.type === 'delta' || currentEventType === 'delta') {
              if (obj.o === 'append' && obj.p === '/message/content/parts/0') fullText += obj.v;
              if (obj.o === 'patch' && Array.isArray(obj.v)) {
                for (const patch of obj.v) {
                  if (patch.o === 'append' && patch.p === '/message/content/parts/0') fullText += patch.v;
                }
              }
              if (obj.v?.message?.author?.role === 'assistant') assistantMessageId = obj.v.message.id;
            }
          } catch (_) {}
        }
      }
    }

    return { text: fullText, conversationId, assistantMessageId };
  }
}

// ── Shared ChatGPT client (1 instance, re-init kalau perlu) ──────────────
let sharedClient = new ChatGPTClient();

async function ensureClient() {
  if (!sharedClient.cookie) await sharedClient.initCookie();
  return sharedClient;
}

// ── Session store (untuk /ai/chatgpt/session/*) ───────────────────────────
const sessionStore = new Map();
const SESSION_TTL  = 60 * 60 * 1000; // 1 jam
const MAX_SESSIONS = 500;
const MAX_HISTORY  = 40; // 20 turn

function pruneExpired() {
  const now = Date.now();
  for (const [id, s] of sessionStore) {
    if (now - s.lastUsed > SESSION_TTL) sessionStore.delete(id);
  }
}

function createSession() {
  pruneExpired();
  if (sessionStore.size >= MAX_SESSIONS) {
    let oldestId = null, oldestTime = Infinity;
    for (const [id, s] of sessionStore) {
      if (s.lastUsed < oldestTime) { oldestTime = s.lastUsed; oldestId = id; }
    }
    if (oldestId) sessionStore.delete(oldestId);
  }
  const id = randomUUID();
  sessionStore.set(id, {
    messages: [],          // [{ role: 'user'|'assistant', text }]
    conversationId: null,  // ChatGPT conversation id
    parentMessageId: null,
    createdAt: Date.now(),
    lastUsed: Date.now(),
  });
  return id;
}

function getSession(id) {
  const s = sessionStore.get(id);
  if (!s) return null;
  if (Date.now() - s.lastUsed > SESSION_TTL) { sessionStore.delete(id); return null; }
  s.lastUsed = Date.now();
  return s;
}

// Cleanup tiap 5 menit
setInterval(pruneExpired, 5 * 60 * 1000);

module.exports = function(app) {

  // ── Simple endpoints ─────────────────────────────────────────────────────

  // GET /ai/chatgpt?text=halo
  app.get('/ai/chatgpt', async (req, res) => {
    const text = req.query.text?.trim();
    if (!text) return res.status(400).json({
      status: false,
      message: "Parameter 'text' wajib diisi! Contoh: /ai/chatgpt?text=halo",
    });

    try {
      const client = await ensureClient();
      try { await client.prepareSentinel(); } catch (_) {}
      const result = await client.sendMessage(text);

      return res.json({
        status: true,
        category: 'Artificial Intelligence',
        query: text,
        data: { author: 'ChatGPT', response: result.text },
      });
    } catch (err) {
      sharedClient = new ChatGPTClient(); // reset
      return res.status(500).json({ status: false, message: err.message });
    }
  });

  // POST /ai/chatgpt  body: { text }
  app.post('/ai/chatgpt', async (req, res) => {
    const text = req.body.text?.trim();
    if (!text) return res.status(400).json({
      status: false,
      message: "Body harus berisi 'text'",
    });

    try {
      const client = await ensureClient();
      try { await client.prepareSentinel(); } catch (_) {}
      const result = await client.sendMessage(text);

      return res.json({
        status: true,
        category: 'Artificial Intelligence',
        query: text,
        data: { author: 'ChatGPT', response: result.text },
      });
    } catch (err) {
      sharedClient = new ChatGPTClient();
      return res.status(500).json({ status: false, message: err.message });
    }
  });

  // ── Session endpoints ────────────────────────────────────────────────────

  // POST /ai/chatgpt/session/new → buat session baru
  app.post('/ai/chatgpt/session/new', (req, res) => {
    const session_id = createSession();
    res.json({
      status: true,
      message: 'Session berhasil dibuat.',
      session_id,
      expires_in: '1 jam sejak pesan terakhir',
      max_history: MAX_HISTORY,
    });
  });

  // POST /ai/chatgpt/session/chat  body: { session_id, text }
  app.post('/ai/chatgpt/session/chat', async (req, res) => {
    const { session_id, text } = req.body || {};

    if (!session_id || typeof session_id !== 'string') {
      return res.status(400).json({
        status: false,
        message: "Field 'session_id' wajib diisi. Buat session dulu via POST /ai/chatgpt/session/new",
      });
    }
    if (!text?.trim()) {
      return res.status(400).json({ status: false, message: "Field 'text' wajib diisi." });
    }

    const session = getSession(session_id);
    if (!session) {
      return res.status(404).json({
        status: false,
        message: 'Session tidak ditemukan atau sudah expired. Buat session baru via POST /ai/chatgpt/session/new',
        session_id,
      });
    }

    session.messages.push({ role: 'user', text: text.trim() });
    while (session.messages.length > MAX_HISTORY) session.messages.splice(0, 2);

    try {
      const client = await ensureClient();
      try { await client.prepareSentinel(); } catch (_) {}

      const result = await client.sendMessage(
        text.trim(),
        session.conversationId,
        session.parentMessageId
      );

      session.conversationId = result.conversationId || session.conversationId;
      session.parentMessageId = result.assistantMessageId || session.parentMessageId;
      session.messages.push({ role: 'assistant', text: result.text });

      return res.json({
        status: true,
        category: 'Artificial Intelligence',
        session_id,
        turn: Math.floor(session.messages.length / 2),
        data: {
          author: 'ChatGPT',
          response: result.text,
        },
      });
    } catch (err) {
      session.messages.pop(); // rollback user message
      sharedClient = new ChatGPTClient();
      return res.status(500).json({ status: false, message: err.message });
    }
  });

  // GET /ai/chatgpt/session/history?session_id=xxx
  app.get('/ai/chatgpt/session/history', (req, res) => {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({
      status: false,
      message: "Parameter 'session_id' wajib diisi.",
    });

    const session = getSession(session_id);
    if (!session) return res.status(404).json({
      status: false,
      message: 'Session tidak ditemukan atau sudah expired.',
      session_id,
    });

    res.json({
      status: true,
      session_id,
      turn: Math.floor(session.messages.length / 2),
      created_at: new Date(session.createdAt).toISOString(),
      history: session.messages.map((m, i) => ({
        index: i + 1,
        role: m.role,
        text: m.text,
      })),
    });
  });

  // DELETE /ai/chatgpt/session/clear  body: { session_id }
  app.delete('/ai/chatgpt/session/clear', (req, res) => {
    const { session_id } = req.body || req.query || {};
    if (!session_id) return res.status(400).json({
      status: false,
      message: "Field 'session_id' wajib diisi.",
    });

    const exists = sessionStore.has(session_id);
    sessionStore.delete(session_id);

    res.json({
      status: true,
      message: exists ? 'Session berhasil dihapus.' : 'Session tidak ditemukan (mungkin sudah expired).',
      session_id,
    });
  });

};
