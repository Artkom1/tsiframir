/**
 * AI INTERPRETATION API
 * Integrates with OpenAI (Chat GPT) for professional numerology analysis
 * Fallback to local database if API unavailable
 */

const crypto = require('crypto');
const { getFromCache, saveToCache } = require('./utils/cache.js');
const { getAIAnalysisOpenAI } = require('./utils/openai-client.js');
const { getPrompt } = require('./utils/prompts.js');

const ALLOWED_CALCULATORS = new Set([
  'personalMatrix', 'birthDate', 'fullName', 'compatibility',
  'wordCode', 'lifeCycles', 'passportAnalysis'
]);
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 8;
const requestWindows = new Map();

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function clientKey(req) {
  const forwarded = clean(req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'], 200);
  const address = forwarded.split(',')[0].trim() || clean(req.socket?.remoteAddress, 100) || 'unknown';
  return crypto.createHash('sha256').update(address).digest('hex');
}

function isRateLimited(req, now = Date.now()) {
  if (requestWindows.size >= 1000) {
    for (const [key, value] of requestWindows) if (value.expiresAt <= now) requestWindows.delete(key);
  }
  const key = clientKey(req);
  const current = requestWindows.get(key);
  if (!current || current.expiresAt <= now) {
    requestWindows.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

function isSameOrigin(req) {
  const origin = clean(req.headers?.origin, 500);
  if (!origin) return false;
  try {
    const allowedOrigins = new Set();
    const canonical = clean(process.env.SITE_URL, 500) || 'https://tsiframir.ru';
    allowedOrigins.add(new URL(canonical).origin);
    const vercelUrl = clean(process.env.VERCEL_URL, 500);
    if (vercelUrl) allowedOrigins.add(new URL(`https://${vercelUrl}`).origin);
    if (process.env.NODE_ENV !== 'production') {
      const host = clean(req.headers?.host, 500);
      if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) allowedOrigins.add(`http://${host}`);
    }
    return allowedOrigins.has(new URL(origin).origin);
  } catch (_) {
    return false;
  }
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'method_not_allowed' });
  }
  if (!isSameOrigin(req)) {
    return res.status(403).json({ success: false, error: 'cross_origin_request' });
  }
  if (clean(req.headers?.['x-requested-with'], 100) !== 'tsiframir-calculator') {
    return res.status(403).json({ success: false, error: 'invalid_request_context' });
  }
  const contentType = clean(req.headers?.['content-type'], 100).toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return res.status(415).json({ success: false, error: 'unsupported_media_type' });
  }
  const contentLength = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > 2048) {
    return res.status(413).json({ success: false, error: 'payload_too_large' });
  }

  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const keys = Object.keys(body);
    const number = body.number;
    const calculatorType = clean(body.calculatorType, 40);
    if (keys.some((key) => !['number', 'calculatorType'].includes(key)) ||
        !Number.isInteger(number) || number < 1 || number > 99 ||
        !ALLOWED_CALCULATORS.has(calculatorType)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_request'
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(200).json({
        success: false,
        fallback: true,
        message: 'AI API не настроен. Используется локальный анализ.'
      });
    }
    if (isRateLimited(req)) {
      return res.status(429).json({
        success: false,
        fallback: true,
        message: 'Слишком много запросов. Пожалуйста, попробуйте позже.'
      });
    }

    // Кэш зависит только от неперсональных, проверенных значений.
    const cacheKey = `analysis_${calculatorType}_${number}`;

    const cachedResult = getFromCache(cacheKey);
    if (cachedResult) {
      return res.status(200).json({
        success: true,
        analysis: cachedResult,
        source: 'cache',
        cached: true
      });
    }

    // Имена, даты, слова и ход расчёта во внешний API не передаются.
    const prompt = getPrompt(number, calculatorType);

    // Отправить в OpenAI API
    const analysis = await getAIAnalysisOpenAI(apiKey, prompt, calculatorType);

    if (!analysis) {
      return res.status(200).json({
        success: false,
        fallback: true,
        message: 'Не удалось получить анализ от AI. Используется локальный анализ.'
      });
    }

    saveToCache(cacheKey, analysis, 30 * 24 * 60 * 60);

    return res.status(200).json({
      success: true,
      analysis: analysis,
      source: 'openai-api',
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in AI interpretation:', error.message);

    // Graceful fallback
    if (error.message.includes('rate_limit')) {
      return res.status(429).json({
        success: false,
        fallback: true,
        message: 'Слишком много запросов. Пожалуйста, попробуйте позже.'
      });
    }

    if (error.message.includes('authentication')) {
      return res.status(401).json({
        success: false,
        fallback: true,
        message: 'Ошибка аутентификации API. Используется локальный анализ.'
      });
    }

    return res.status(200).json({
      success: false,
      fallback: true,
      message: 'Ошибка при генерации анализа. Используется локальный анализ.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = handler;
module.exports._test = { clientKey, isRateLimited, isSameOrigin, requestWindows };
