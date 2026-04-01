/**
 * CACHE SYSTEM
 * Simple in-memory cache with TTL
 * For production, replace with Redis
 */

const cache = new Map();

/**
 * Get value from cache if not expired
 */
export function getFromCache(key) {
  if (!cache.has(key)) {
    return null;
  }

  const cached = cache.get(key);

  // Проверить что не истекло время жизни
  if (cached.expiresAt && cached.expiresAt < Date.now()) {
    console.log(`🗑️  Cache expired: ${key}`);
    cache.delete(key);
    return null;
  }

  console.log(`✅ Cache hit: ${key}`);
  return cached.data;
}

/**
 * Save value to cache with TTL
 */
export function saveToCache(key, data, ttlSeconds = 2592000) {
  // Default TTL = 30 days (2592000 seconds)
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
    createdAt: new Date().toISOString()
  });

  console.log(`💾 Cached: ${key} (TTL: ${ttlSeconds}s)`);
}

/**
 * Clear cache
 */
export function clearCache() {
  cache.clear();
  console.log('🗑️  Cache cleared');
}

/**
 * Get cache stats
 */
export function getCacheStats() {
  let validCount = 0;
  let expiredCount = 0;

  cache.forEach((value) => {
    if (value.expiresAt && value.expiresAt < Date.now()) {
      expiredCount++;
    } else {
      validCount++;
    }
  });

  return {
    total: cache.size,
    valid: validCount,
    expired: expiredCount
  };
}
