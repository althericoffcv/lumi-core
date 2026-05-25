const crypto = require("crypto");

class ChatGpt {
    constructor(c = {}) {
        this.useAuth = c.useAuth || false;
        this.baseUrl = "https://chatgpt.com";
        this.user_agent = c.user_agent || "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36";
        this.msgid = c.msg_id || crypto.randomUUID();
        this.oai_did = c.did || crypto.randomUUID();
        this.screen_width = c.width || 1920;
        this.screen_height = c.height || 1080;
        this.lang = c.lang || "en-US";
        this.build_number = c.build_number || "prod-2294c45e1eaa6a898633916fa7682b2e6b912617";
    }

    web_headers(extra = {}) {
        return {
            "OAI-Device-Id": this.oai_did,
            accept: "*/*",
            ...(this.useAuth ? { authorization: `Bearer ${this.useAuth}` } : {}),
            "User-Agent": this.user_agent,
            "accept-language": "en-US,en;q=0.9,id-ID;q=0.8,id;q=0.7",
            "content-type": "application/json",
            "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            Referer: "https://chatgpt.com",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            ...extra
        };
    }

    qh(t) {
        return Buffer.from(JSON.stringify(t)).toString("base64");
    }

    nce(t) {
        let e = 2166136261;
        for (let n = 0; n < t.length; n++) {
            e ^= t.charCodeAt(n);
            e = Math.imul(e, 16777619) >>> 0;
        }
        e ^= e >>> 16;
        e = Math.imul(e, 2246822507) >>> 0;
        e ^= e >>> 13;
        e = Math.imul(e, 3266489909) >>> 0;
        e ^= e >>> 16;
        return (e >>> 0).toString(16).padStart(8, "0");
    }

    createBrowserConfig() {
        return [
            this.screen_width + this.screen_height,
            "" + new Date(),
            2172649472,
            Math.random(),
            this.user_agent,
            null,
            this.build_number,
            this.lang,
            `${this.lang},en`,
            Math.random(),
            "contacts−[object ContactsManager]",
            "_reactListening6506zq7cxya",
            "Nazir",
            performance.now(),
            this.msgid,
            "",
            8,
            performance.timeOrigin,
            0, 0, 0, 0, 0, 0, 0
        ];
    }

    runCheck(s, seed, d, config, a) {
        config[3] = a;
        config[9] = Math.round(performance.now() - s);
        const x = this.qh(config);
        return this.nce(seed + x).substring(0, d.length) <= d ? x + "~S" : null;
    }

    getPow(seed, difficulty, config) {
        const s = performance.now();
        for (let r = 0; r < 500000; r++) {
            const a = this.runCheck(s, seed, difficulty, config, r);
            if (a) return "gAAAAAB" + a;
        }
        return "wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4De";
    }

    getRequirementsTokenBlocking() {
        const n = performance.now();
        const config = this.createBrowserConfig();
        config[3] = 1;
        config[9] = performance.now() - n;
        return "gAAAAAC" + this.qh(config);
    }

    async generateTkn() {
        const pData = this.getRequirementsTokenBlocking();
        const config = this.createBrowserConfig();

        const prepareRes = await fetch(`${this.baseUrl}/backend-anon/sentinel/chat-requirements/prepare`, {
            method: "POST",
            headers: this.web_headers(),
            body: JSON.stringify({ p: pData })
        }).then(r => r.json());

        let powToken = null;
        if (prepareRes.proofofwork?.required)
            powToken = this.getPow(prepareRes.proofofwork.seed, prepareRes.proofofwork.difficulty, config);

        const turnstileToken = crypto
            .randomBytes(Math.floor((2256 / 4) * 3))
            .toString("base64")
            .slice(0, 2256);

        const finalizeBody = { prepare_token: prepareRes.prepare_token || "" };
        if (powToken) finalizeBody.proofofwork = powToken;
        if (turnstileToken) finalizeBody.turnstile = turnstileToken;

        const finalizeRes = await fetch(`${this.baseUrl}/backend-anon/sentinel/chat-requirements/finalize`, {
            method: "POST",
            headers: this.web_headers(),
            body: JSON.stringify(finalizeBody)
        }).then(r => r.json());

        return { pow: powToken, turnstile: turnstileToken, prepare_token: finalizeRes.token || null };
    }

    initConversation(t, p = false, w = false, id = this.msgid) {
        const b = {
            action: "next",
            parent_message_id: "client-created-root",
            model: "auto",
            timezone_offset_min: new Date().getTimezoneOffset(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            conversation_mode: { kind: "primary_assistant" },
            system_hints: [],
            supports_buffering: true,
            supported_encodings: ["v1"]
        };

        if (p) return {
            ...b,
            fork_from_shared_post: false,
            partial_query: { id, author: { role: "user" }, content: { content_type: "text", parts: [t] } },
            client_contextual_info: { app_name: "chatgpt.com" }
        };

        const o = {
            ...b,
            messages: [{
                id,
                author: { role: "user" },
                create_time: Date.now() / 1e3,
                content: { content_type: "text", parts: [t] },
                metadata: {
                    selected_github_repos: [],
                    selected_all_github_repos: false,
                    serialization_metadata: { custom_symbol_offsets: [] }
                }
            }],
            enable_message_followups: true,
            client_contextual_info: {
                is_dark_mode: true,
                time_since_loaded: 24,
                page_height: 850,
                page_width: 451,
                pixel_ratio: 1.594152808189392,
                screen_height: this.screen_height,
                screen_width: this.screen_width,
                app_name: "chatgpt.com"
            },
            paragen_cot_summary_display_override: "allow",
            force_parallel_switch: "auto"
        };

        if (w) Object.assign(o, {
            system_hints: ["search"],
            force_use_search: true,
            client_reported_search_source: "conversation_composer_web_icon",
            messages: [{ ...o.messages[0], metadata: { ...o.messages[0].metadata, system_hints: ["search"] } }]
        });

        return o;
    }

    async init(msg, web, id) {
        if (!msg) return "no msg";
        const r = await fetch("https://chatgpt.com/backend-anon/f/conversation/prepare", {
            method: "POST",
            headers: this.web_headers({ "X-Conduit-Token": "no-token" }),
            body: JSON.stringify(this.initConversation(msg, true, web, id))
        });
        const tkn = await r.json();
        return tkn.token;
    }

    async startConversation(msg, web = false) {
        if (!msg) return { subtitle: null, model: null, msg: "no msg" };

        const req = await this.generateTkn();
        const id = this.msgid;
        const conduit = await this.init(msg, web, id);

        const res = await fetch("https://chatgpt.com/backend-anon/f/conversation", {
            method: "POST",
            body: JSON.stringify(this.initConversation(msg, false, web, id)),
            headers: this.web_headers({
                "OAI-Language": "en-US",
                "OpenAI-Sentinel-Chat-Requirements-Token": req.prepare_token,
                "OpenAI-Sentinel-Turnstile-Token": req.turnstile,
                "OpenAI-Sentinel-Proof-Token": req.pow,
                "X-Conduit-Token": conduit,
                accept: "text/event-stream"
            })
        });

        // native fetch: baca body sebagai text lalu parse SSE manual
        const rawText = await res.text();
        const lines = rawText.split("\n");

        let finalText = "";
        let subtitle = null;
        let model = null;

        for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") break;
            try {
                const json = JSON.parse(data);
                if (json.type === "title_generation") subtitle = json.title;
                if (json.type === "server_ste_metadata") model = json.metadata?.model_slug;

                if (json.o === "patch" || Array.isArray(json.v)) {
                    for (const p of (json.v || [])) {
                        if (p.o === "append" && p.p?.includes("/message/content/parts/0")) {
                            finalText += p.v;
                        }
                    }
                }
            } catch (_) {}
        }

        return { subtitle, model, msg: finalText };
    }
}

module.exports = function(app) {
    app.get('/ai/chatgpt', async (req, res) => {
        const { text } = req.query;

        if (!text || !text.trim()) return res.status(400).json({
            status: false,
            message: "Parameter 'text' wajib diisi! Contoh: /ai/chatgpt?text=halo"
        });

        try {
            const gpt = new ChatGpt();
            const result = await gpt.startConversation(text.trim());

            if (!result?.msg) throw new Error('Tidak ada respons dari ChatGPT.');

            res.json({
                status: true,
                category: 'Artificial Intelligence',
                query: text.trim(),
                data: {
                    author: 'ChatGPT',
                    model: result.model || 'auto',
                    subtitle: result.subtitle || null,
                    response: result.msg
                }
            });
        } catch (err) {
            res.status(500).json({
                status: false,
                message: err.message
            });
        }
    });
};
