const rateLimit = require('express-rate-limit');

const normalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: 'Too many requests. Please slow down.' }
});

const heavyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: 'Too many requests on heavy endpoint.' }
});

const lightLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: 'Too many requests.' }
});

module.exports = { normalLimiter, heavyLimiter, lightLimiter };
