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
    // Ambil cookie dari chatgpt.com untuk session anonymous
    const res = await fetch('https://chatgpt.com/', {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
      },
    });
    const setCookie = res.headers.get('set-cookie') || '';
    // Ambil semua cookie key=value
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
        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
          continue;
        }
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

// Singleton client per session
const clients = new Map();

function getClient(sessionId) {
  if (!clients.has(sessionId)) {
    clients.set(sessionId, {
      client: new ChatGPTClient(),
      conversationId: null,
      parentMessageId: null,
      lastUsed: Date.now(),
    });
  }
  return clients.get(sessionId);
}

// Cleanup session tidak aktif > 30 menit
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of clients.entries()) {
    if (now - s.lastUsed > 30 * 60 * 1000) clients.delete(id);
  }
}, 5 * 60 * 1000);

module.exports = function(app) {

  // GET /ai/chatgpt?text=halo
  // GET /ai/chatgpt?text=halo&session=xxx  (untuk multi-turn)
  // GET /ai/chatgpt?text=halo&session=xxx&reset=true  (reset percakapan)
  app.get('/ai/chatgpt', async (req, res) => {
    const text = req.query.text?.trim();
    const sessionId = req.query.session || 'default';
    const reset = req.query.reset === 'true';

    if (!text) return res.status(400).json({
      status: false,
      message: "Parameter 'text' wajib diisi! Contoh: /ai/chatgpt?text=halo",
    });

    try {
      const session = getClient(sessionId);
      session.lastUsed = Date.now();

      if (reset) {
        session.conversationId = null;
        session.parentMessageId = null;
      }

      // Init cookie kalau belum ada
      if (!session.client.cookie) await session.client.initCookie();

      // Prepare sentinel
      try { await session.client.prepareSentinel(); } catch (_) {}

      const result = await session.client.sendMessage(
        text,
        session.conversationId,
        session.parentMessageId
      );

      session.conversationId = result.conversationId || session.conversationId;
      session.parentMessageId = result.assistantMessageId || session.parentMessageId;

      return res.json({
        status: true,
        category: 'Artificial Intelligence',
        query: text,
        data: {
          author: 'ChatGPT',
          response: result.text,
          session: sessionId,
          conversation_id: session.conversationId,
        },
      });

    } catch (err) {
      // Reset cookie supaya re-init di request berikutnya
      const session = clients.get(sessionId);
      if (session) session.client.cookie = null;
      return res.status(500).json({ status: false, message: err.message });
    }
  });

  // POST /ai/chatgpt  body: { text, session, reset }
  app.post('/ai/chatgpt', async (req, res) => {
    const text = req.body.text?.trim();
    const sessionId = req.body.session || 'default';
    const reset = req.body.reset === true;

    if (!text) return res.status(400).json({
      status: false,
      message: "Body harus berisi 'text'",
    });

    try {
      const session = getClient(sessionId);
      session.lastUsed = Date.now();

      if (reset) {
        session.conversationId = null;
        session.parentMessageId = null;
      }

      if (!session.client.cookie) await session.client.initCookie();
      try { await session.client.prepareSentinel(); } catch (_) {}

      const result = await session.client.sendMessage(
        text,
        session.conversationId,
        session.parentMessageId
      );

      session.conversationId = result.conversationId || session.conversationId;
      session.parentMessageId = result.assistantMessageId || session.parentMessageId;

      return res.json({
        status: true,
        category: 'Artificial Intelligence',
        query: text,
        data: {
          author: 'ChatGPT',
          response: result.text,
          session: sessionId,
          conversation_id: session.conversationId,
        },
      });

    } catch (err) {
      const session = clients.get(sessionId);
      if (session) session.client.cookie = null;
      return res.status(500).json({ status: false, message: err.message });
    }
  });

};
