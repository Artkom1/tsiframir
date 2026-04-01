/**
 * AI INTERPRETATION API
 * Integrates with OpenAI (Chat GPT) for professional numerology analysis
 * Fallback to local database if API unavailable
 */

import { getFromCache, saveToCache } from './utils/cache.js';
import { getAIAnalysisOpenAI } from './utils/openai-client.js';
import { getPrompt } from './utils/prompts.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Только POST запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { number, calculatorType, userData, person1Name, person2Name } = req.body;

    // Валидация входных данных
    if (!number) {
      return res.status(400).json({
        success: false,
        error: 'Missing number parameter'
      });
    }

    console.log(`📊 AI Analysis Request: number=${number}, type=${calculatorType}`);

    // Проверить наличие API ключа
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.log('⚠️  OPENAI_API_KEY not configured - using local analysis only');
      return res.status(200).json({
        success: false,
        fallback: true,
        message: 'AI API не настроен. Используется локальный анализ.'
      });
    }

    // Создать уникальный ключ кэша
    const cacheKey = createCacheKey(number, calculatorType, person1Name, person2Name);
    console.log(`🔍 Cache key: ${cacheKey}`);

    // Проверить кэш
    const cachedResult = getFromCache(cacheKey);
    if (cachedResult) {
      console.log(`✅ Cache hit for ${cacheKey}`);
      return res.status(200).json({
        success: true,
        analysis: cachedResult,
        source: 'cache',
        cached: true
      });
    }

    console.log(`📡 Cache miss - calling OpenAI API...`);

    // Получить промпт для AI
    const prompt = getPrompt(
      number,
      calculatorType,
      userData,
      person1Name,
      person2Name
    );

    // Отправить в OpenAI API
    const analysis = await getAIAnalysisOpenAI(apiKey, prompt, calculatorType);

    if (!analysis) {
      return res.status(200).json({
        success: false,
        fallback: true,
        message: 'Не удалось получить анализ от AI. Используется локальный анализ.'
      });
    }

    // Сохранить в кэш (на 30 дней)
    saveToCache(cacheKey, analysis, 30 * 24 * 60 * 60);
    console.log(`💾 Saved to cache: ${cacheKey}`);

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

/**
 * Создать уникальный ключ для кэша
 */
function createCacheKey(number, calculatorType, person1Name, person2Name) {
  if (calculatorType === 'compatibility' && person1Name && person2Name) {
    // Для совместимости используем сортированные имена
    const names = [person1Name, person2Name].sort().join('_');
    return `analysis_compat_${names}`;
  }
  return `analysis_${number}_${calculatorType}`;
}
