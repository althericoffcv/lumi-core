/**
 * ╔═══════════════════════════════════════════╗
 * ║         Rate Limiter / Overlimit          ║
 * ║   Stabilitas & Uptime Protection          ║
 * ╚═══════════════════════════════════════════╝
 */

const rateStore = new Map(); // IP -> { count, resetAt }

/**
 * Bersihkan entri yang sudah expired setiap 5 menit
 * Mencegah memory leak untuk stabilitas jangka panjang
 */
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of rateStore.entries()) {
        if (now > data.resetAt) rateStore.delete(ip);
    }
}, 5 * 60 * 1000);

/**
 * Buat middleware rate limiter
 * @param {object} opts
 * @param {number} opts.windowMs     - Window waktu dalam ms (default: 60000 = 1 menit)
 * @param {number} opts.max          - Max request per window (default: 30)
 * @param {string} opts.message      - Pesan saat overlimit
 */
function createRateLimiter(opts = {}) {
    const {
        windowMs = 60 * 1000,         // 1 menit
        max = 30,                      // 30 req/menit per IP
        message = 'Terlalu banyak request! Harap tunggu sebelum mencoba lagi.',
    } = opts;

    return function rateLimiter(req, res, next) {
        // Ambil IP (support proxy/Vercel/Railway/Render/Koyeb)
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.headers['x-real-ip']
            || req.connection?.remoteAddress
            || req.socket?.remoteAddress
            || '0.0.0.0';

        // Skip rate limit untuk health check
        if (req.path === '/health' || req.path === '/ping') return next();

        const now = Date.now();
        const entry = rateStore.get(ip);

        if (!entry || now > entry.resetAt) {
            // Window baru
            rateStore.set(ip, { count: 1, resetAt: now + windowMs });
            
            // Set headers info
            res.set({
                'X-RateLimit-Limit': max,
                'X-RateLimit-Remaining': max - 1,
                'X-RateLimit-Reset': Math.ceil((now + windowMs) / 1000)
            });
            return next();
        }

        entry.count++;
        const remaining = Math.max(0, max - entry.count);
        const resetIn = Math.ceil((entry.resetAt - now) / 1000);

        res.set({
            'X-RateLimit-Limit': max,
            'X-RateLimit-Remaining': remaining,
            'X-RateLimit-Reset': Math.ceil(entry.resetAt / 1000),
            'Retry-After': resetIn
        });

        if (entry.count > max) {
            return res.status(429).json({
                status: false,
                error: 'overlimit',
                message,
                retry_after: `${resetIn} detik`,
                limit: max,
                window: `${windowMs / 1000} detik`
            });
        }

        next();
    };
}

/**
 * Rate limiter ketat untuk endpoint berat (AI, downloader)
 */
const heavyLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Endpoint ini dibatasi 10 request/menit per IP. Harap tunggu.'
});

/**
 * Rate limiter normal untuk endpoint biasa
 */
const normalLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Terlalu banyak request! Batas 30 request/menit per IP.'
});

/**
 * Rate limiter ringan untuk endpoint search/info
 */
const lightLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Terlalu banyak request! Batas 60 request/menit per IP.'
});

module.exports = {
    createRateLimiter,
    heavyLimiter,
    normalLimiter,
    lightLimiter
};
