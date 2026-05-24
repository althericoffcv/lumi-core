const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');
const path = require('path');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const BASE_URL = 'https://wink.ai';
const STRATEGY_URL = 'https://strategy.app.meitudata.com';
const CLIENT_ID = '1189857605';
const VERSION = '5.1.2';
const COUNTRY_CODE = 'ID';
const CLIENT_LANGUAGE = 'en_US';
const CLIENT_TIMEZONE = 'Asia/Jakarta';
const TASK_TYPE = '12';
const CONTENT_TYPE = '1';
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeTrace() {
    return `${crypto.randomBytes(16).toString('hex')}-${crypto.randomBytes(8).toString('hex')}-1`;
}

function traceHeaders(transaction = 'GET%20%2F%5Blocale%5D%2Fimage-enhancer%2Fupload') {
    const trace = makeTrace();
    return {
        'sentry-trace': trace,
        baggage: [
            'sentry-environment=release',
            'sentry-release=5.1.2%20(b60d25c477f43c6dfac4107810f26d442320f4f1)',
            'sentry-public_key=e1bf914f3448d9bc8a10c7e499d17d54',
            `sentry-trace_id=${trace.split('-')[0]}`,
            `sentry-transaction=${transaction}`,
            'sentry-sampled=true',
            'sentry-sample_rate=0.75'
        ].join(',')
    };
}

function baseParams(gnum, extra = {}) {
    return new URLSearchParams({
        client_id: CLIENT_ID, version: VERSION, country_code: COUNTRY_CODE,
        gnum, client_language: CLIENT_LANGUAGE, client_channel_id: '',
        client_timezone: CLIENT_TIMEZONE, ...extra
    });
}

async function downloadToBuffer(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, headers: { 'User-Agent': UA } });
    const ct = res.headers['content-type'] || '';
    let ext = '.jpg';
    if (ct.includes('png')) ext = '.png';
    else if (ct.includes('webp')) ext = '.webp';
    return { buffer: Buffer.from(res.data), ext, mime: ct.split(';')[0].trim() };
}

async function enhance(imageUrl) {
    const gnum = crypto.randomUUID();
    const jar = new CookieJar();
    await jar.setCookie(`_sm=${gnum}; Path=/; Domain=wink.ai`, BASE_URL);
    await jar.setCookie(`meitustat=${encodeURIComponent(JSON.stringify({ wgid: gnum }))}; Path=/; Domain=wink.ai`, BASE_URL);

    const api = wrapper(axios.create({
        baseURL: BASE_URL, jar, withCredentials: true, validateStatus: () => true,
        headers: {
            accept: '*/*', origin: BASE_URL, referer: `${BASE_URL}/image-enhancer/upload`,
            'user-agent': UA, 'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
            'sec-ch-ua-mobile': '?1', 'sec-ch-ua-platform': '"Android"',
            ab_info: JSON.stringify({ ab_codes: [], version: '1.4.4' })
        }
    }));

    const { buffer, ext, mime } = await downloadToBuffer(imageUrl);
    const filename = `image_${Date.now()}${ext}`;

    const signParams = baseParams(gnum, { suffix: ext === '.jpeg' ? '.jpg' : ext, type: 'temp', count: '1' });
    const signRes = await api.get(`/api/file/get_maat_sign.json?${signParams.toString()}`, { headers: traceHeaders() });
    if (signRes.status >= 400 || signRes.data?.code !== 0) throw new Error(`get_maat_sign gagal: ${JSON.stringify(signRes.data)}`);
    const sign = signRes.data.data;

    const policyParams = new URLSearchParams({
        app: sign.app, count: String(sign.count), sig: sign.sig,
        sigTime: sign.sig_time, sigVersion: sign.sig_version, suffix: sign.suffix, type: sign.type
    });
    const policyRes = await axios.get(`${STRATEGY_URL}/upload/policy?${policyParams.toString()}`, {
        headers: { accept: '*/*', origin: BASE_URL, referer: `${BASE_URL}/`, 'user-agent': UA },
        validateStatus: () => true
    });
    if (policyRes.status >= 400 || !Array.isArray(policyRes.data) || !policyRes.data[0]?.qiniu) {
        throw new Error(`upload policy gagal: ${JSON.stringify(policyRes.data)}`);
    }
    const policy = policyRes.data[0].qiniu;

    const form = new FormData();
    form.append('file', buffer, { filename, contentType: mime });
    form.append('token', policy.token);
    form.append('key', policy.key);
    form.append('fname', filename);

    const uploadRes = await axios.post(policy.url, form, {
        headers: form.getHeaders({ origin: BASE_URL, referer: `${BASE_URL}/`, 'user-agent': UA, accept: '*/*' }),
        maxBodyLength: Infinity, maxContentLength: Infinity, validateStatus: () => true
    });
    if (uploadRes.status >= 400) throw new Error(`upload qiniu gagal HTTP ${uploadRes.status}`);
    if (!uploadRes.data?.url && !uploadRes.data?.data) throw new Error(`upload qiniu response tidak valid`);

    const sourceUrl = uploadRes.data.url || uploadRes.data.data || policy.data;
    const fileKey = policy.key;

    const metaBody = baseParams(gnum, { file_key: fileKey });
    await api.post('/api/file/meta_info.json', metaBody.toString(), {
        headers: { ...traceHeaders(), 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }
    });

    const taskName = `Enhancer-Ultra HD-${filename.replace(/\.[^/.]+$/, '')}`;
    const typeParams = JSON.stringify({ is_mirror: 0, orientation_tag: 1, j_420_trans: '1', return_ext: '2' });
    const rightDetail = JSON.stringify({ source: '1', touch_type: '4', function_id: '630', material_id: '63011', url: `${BASE_URL}/image-enhancer/upload` });

    const deliveryBody = baseParams(gnum, {
        type: TASK_TYPE, content_type: CONTENT_TYPE, source_url: sourceUrl,
        type_params: typeParams, right_detail: rightDetail,
        ext_params: JSON.stringify({ task_name: taskName, records: TASK_TYPE }),
        with_prepare: '1'
    });
    const deliveryRes = await api.post('/api/meitu_ai/delivery.json', deliveryBody.toString(), {
        headers: { ...traceHeaders(), 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }
    });
    if (deliveryRes.status >= 400 || deliveryRes.data?.code !== 0) throw new Error(`delivery gagal: ${JSON.stringify(deliveryRes.data)}`);

    const taskData = deliveryRes.data.data || {};
    let msgId = taskData.msg_id || taskData.prepare_msg_id;
    if (!msgId) throw new Error(`delivery tidak mengembalikan msg_id`);

    for (let i = 0; i < 80; i++) {
        const qParams = baseParams(gnum, { msg_ids: msgId });
        const qRes = await api.get(`/api/meitu_ai/query_batch.json?${qParams.toString()}`, {
            headers: { ...traceHeaders('%2F%3Alocale%2Feditor%2Frecent-task'), referer: `${BASE_URL}/image-enhancer/upload` }
        });
        if (qRes.status >= 400 || qRes.data?.code !== 0) throw new Error(`query batch gagal: ${JSON.stringify(qRes.data)}`);

        const data = qRes.data.data;
        const item = data?.item_list?.[0];
        const resultValue = item?.result?.result || '';
        const realMsgId = item?.result?.msg_id || item?.msg_id || '';

        if (resultValue && resultValue !== msgId && !resultValue.startsWith('http')) { msgId = resultValue; await sleep(1000); continue; }
        if (realMsgId && realMsgId !== msgId && !realMsgId.startsWith('wpr_')) { msgId = realMsgId; await sleep(1000); continue; }

        const resultUrl = item?.result?.media_info_list?.[0]?.media_data || '';
        const errorCode = item?.result?.error_code;
        const errorMsg = item?.result?.error_msg;

        if (resultUrl && resultUrl.startsWith('http') && errorCode === 0) return resultUrl;
        if (errorCode && errorCode !== 29901 && errorCode !== 0) throw new Error(`task gagal: ${errorCode} ${errorMsg || ''}`);

        await sleep(3000);
    }

    throw new Error('Timeout: hasil enhancement tidak selesai dalam waktu yang ditentukan');
}

module.exports = (app) => {
    app.get('/tools/wink', async (req, res) => {
        const { url } = req.query;

        if (!url) return res.status(400).json({
            status: false,
            message: "Parameter 'url' wajib diisi! Contoh: /tools/wink?url=https://example.com/image.jpg"
        });

        try { new URL(url); } catch {
            return res.status(400).json({ status: false, message: 'URL tidak valid.' });
        }

        try {
            const result = await enhance(url);
            const img = await axios.get(result, { responseType: 'arraybuffer', timeout: 30000, headers: { 'User-Agent': UA } });
            const ct = img.headers['content-type'] || 'image/jpeg';
            res.setHeader('Content-Type', ct);
            res.setHeader('Content-Disposition', 'inline');
            res.end(Buffer.from(img.data), 'binary');
        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });
};
