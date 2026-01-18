/**
 * Apigen - Genel Yardımcı Fonksiyonlar
 *
 * Bu modül, proje genelinde kullanılan yardımcı fonksiyonları içerir.
 * String manipülasyonu, obje işlemleri ve genel utility fonksiyonları.
 *
 * @module utils/helpers
 */

// ============================================================================
// STRING İŞLEMLERİ
// ============================================================================

/**
 * String'i slug formatına çevirir
 *
 * - Küçük harfe çevirir
 * - Boşlukları tire ile değiştirir
 * - Özel karakterleri kaldırır
 * - Türkçe karakterleri dönüştürür
 *
 * @param text - Dönüştürülecek metin
 * @returns Slug formatında metin
 *
 * @example
 * ```typescript
 * slugify('Hello World');     // 'hello-world'
 * slugify('Türkçe Karakter'); // 'turkce-karakter'
 * slugify('API v2.0');        // 'api-v2-0'
 * ```
 */
export function slugify(text: string): string {
  // Türkçe karakter dönüşüm tablosu
  const turkishMap: Record<string, string> = {
    'ç': 'c', 'Ç': 'c',
    'ğ': 'g', 'Ğ': 'g',
    'ı': 'i', 'I': 'i',
    'İ': 'i', 'i': 'i',
    'ö': 'o', 'Ö': 'o',
    'ş': 's', 'Ş': 's',
    'ü': 'u', 'Ü': 'u'
  };

  return text
    // Türkçe karakterleri dönüştür
    .replace(/[çÇğĞıIİöÖşŞüÜ]/g, char => turkishMap[char] || char)
    // Küçük harfe çevir
    .toLowerCase()
    // Alfanumerik olmayan karakterleri tire ile değiştir
    .replace(/[^a-z0-9]+/g, '-')
    // Baştaki ve sondaki tireleri kaldır
    .replace(/^-+|-+$/g, '')
    // Birden fazla tireyi tek tireye indir
    .replace(/-{2,}/g, '-');
}

/**
 * String'in ilk harfini büyük yapar
 *
 * @param text - Dönüştürülecek metin
 * @returns İlk harfi büyük metin
 *
 * @example
 * ```typescript
 * capitalize('hello');  // 'Hello'
 * capitalize('WORLD');  // 'WORLD'
 * ```
 */
export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * String'i Title Case'e çevirir
 *
 * Her kelimenin ilk harfini büyük yapar.
 *
 * @param text - Dönüştürülecek metin
 * @returns Title case metin
 *
 * @example
 * ```typescript
 * toTitleCase('hello world');  // 'Hello World'
 * toTitleCase('the quick-fox'); // 'The Quick-Fox'
 * ```
 */
export function toTitleCase(text: string): string {
  return text.replace(
    /\w\S*/g,
    word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

/**
 * CamelCase'i kebab-case'e çevirir
 *
 * @param text - CamelCase metin
 * @returns kebab-case metin
 *
 * @example
 * ```typescript
 * camelToKebab('getUserById');  // 'get-user-by-id'
 * camelToKebab('XMLParser');    // 'xml-parser'
 * ```
 */
export function camelToKebab(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * kebab-case'i camelCase'e çevirir
 *
 * @param text - kebab-case metin
 * @returns camelCase metin
 *
 * @example
 * ```typescript
 * kebabToCamel('get-user-by-id');  // 'getUserById'
 * ```
 */
export function kebabToCamel(text: string): string {
  return text.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * snake_case'i camelCase'e çevirir
 *
 * @param text - snake_case metin
 * @returns camelCase metin
 */
export function snakeToCamel(text: string): string {
  return text.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * String'i belirli uzunlukta keser ve ... ekler
 *
 * @param text - Kesilecek metin
 * @param maxLength - Maksimum uzunluk
 * @param suffix - Ek (varsayılan: '...')
 * @returns Kesilmiş metin
 *
 * @example
 * ```typescript
 * truncate('Long text here', 10);  // 'Long te...'
 * ```
 */
export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * String'i belirli genişlikte sağa hizalar
 *
 * @param text - Metin
 * @param width - Hedef genişlik
 * @param padChar - Dolgu karakteri (varsayılan: boşluk)
 * @returns Hizalanmış metin
 */
export function padStart(text: string, width: number, padChar: string = ' '): string {
  return text.padStart(width, padChar);
}

/**
 * String'i belirli genişlikte sola hizalar
 *
 * @param text - Metin
 * @param width - Hedef genişlik
 * @param padChar - Dolgu karakteri (varsayılan: boşluk)
 * @returns Hizalanmış metin
 */
export function padEnd(text: string, width: number, padChar: string = ' '): string {
  return text.padEnd(width, padChar);
}

// ============================================================================
// OBJE İŞLEMLERİ
// ============================================================================

/**
 * İki objeyi deep merge eder
 *
 * Source obje target'ı override eder.
 * Array'ler concat yerine replace edilir.
 *
 * @param target - Hedef obje
 * @param source - Kaynak obje
 * @returns Merge edilmiş yeni obje
 *
 * @example
 * ```typescript
 * const a = { x: 1, nested: { y: 2 } };
 * const b = { nested: { z: 3 } };
 * deepMerge(a, b);  // { x: 1, nested: { y: 2, z: 3 } }
 * ```
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      // Nested object - recursive merge
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      // Primitive, array veya null - direct assign
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Objeyi deep clone eder
 *
 * @param obj - Clone edilecek obje
 * @returns Clone obje
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  const cloned = {} as T;
  for (const key of Object.keys(obj as object) as Array<keyof T>) {
    cloned[key] = deepClone((obj as T)[key]);
  }

  return cloned;
}

/**
 * Objedeki undefined ve null değerleri temizler
 *
 * @param obj - Temizlenecek obje
 * @param removeNull - null değerleri de kaldır (varsayılan: false)
 * @returns Temizlenmiş obje
 */
export function removeEmpty<T extends Record<string, unknown>>(
  obj: T,
  removeNull: boolean = false
): Partial<T> {
  const result: Partial<T> = {};

  for (const key of Object.keys(obj) as Array<keyof T>) {
    const value = obj[key];

    if (value === undefined) continue;
    if (removeNull && value === null) continue;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const cleaned = removeEmpty(value as Record<string, unknown>, removeNull);
      if (Object.keys(cleaned).length > 0) {
        result[key] = cleaned as T[keyof T];
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Objeyi dot notation path ile okur
 *
 * @param obj - Kaynak obje
 * @param path - Dot notation path (örn: 'user.address.city')
 * @param defaultValue - Varsayılan değer
 * @returns Bulunan değer veya varsayılan
 *
 * @example
 * ```typescript
 * const obj = { user: { name: 'John' } };
 * getByPath(obj, 'user.name');        // 'John'
 * getByPath(obj, 'user.age', 0);      // 0
 * ```
 */
export function getByPath<T = unknown>(
  obj: Record<string, unknown>,
  path: string,
  defaultValue?: T
): T | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return defaultValue;
    }

    if (typeof current !== 'object') {
      return defaultValue;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return (current as T) ?? defaultValue;
}

/**
 * Objeyi dot notation path ile günceller
 *
 * @param obj - Hedef obje
 * @param path - Dot notation path
 * @param value - Yeni değer
 */
export function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }

    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
}

// ============================================================================
// ARRAY İŞLEMLERİ
// ============================================================================

/**
 * Array'i belirli bir property'e göre gruplar
 *
 * @param array - Gruplanacak array
 * @param keyFn - Key çıkaran fonksiyon
 * @returns Gruplanmış obje
 *
 * @example
 * ```typescript
 * const users = [{ name: 'A', age: 20 }, { name: 'B', age: 20 }];
 * groupBy(users, u => u.age);  // { 20: [{ name: 'A', ... }, { name: 'B', ... }] }
 * ```
 */
export function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {} as Record<K, T[]>);
}

/**
 * Array'den tekrar eden elemanları kaldırır
 *
 * @param array - Kaynak array
 * @param keyFn - Karşılaştırma key'i çıkaran fonksiyon (opsiyonel)
 * @returns Benzersiz elemanlar
 */
export function unique<T>(array: T[], keyFn?: (item: T) => unknown): T[] {
  if (!keyFn) {
    return [...new Set(array)];
  }

  const seen = new Set<unknown>();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Array'i chunk'lara böler
 *
 * @param array - Bölünecek array
 * @param size - Chunk boyutu
 * @returns Chunk'lar
 *
 * @example
 * ```typescript
 * chunk([1, 2, 3, 4, 5], 2);  // [[1, 2], [3, 4], [5]]
 * ```
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

// ============================================================================
// TİP KONTROL FONKSİYONLARI
// ============================================================================

/**
 * Değerin string olup olmadığını kontrol eder
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Değerin number olup olmadığını kontrol eder
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Değerin boolean olup olmadığını kontrol eder
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Değerin object olup olmadığını kontrol eder (null ve array hariç)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Değerin array olup olmadığını kontrol eder
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Değerin null veya undefined olup olmadığını kontrol eder
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Değerin boş olup olmadığını kontrol eder
 * - null/undefined için true
 * - Boş string için true
 * - Boş array için true
 * - Boş obje için true
 */
export function isEmpty(value: unknown): boolean {
  if (isNullish(value)) return true;
  if (isString(value)) return value.trim() === '';
  if (isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}

// ============================================================================
// ZAMAN İŞLEMLERİ
// ============================================================================

/**
 * Belirli süre bekler (async)
 *
 * @param ms - Milisaniye
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Tarihi formatlar
 *
 * @param date - Tarih
 * @param format - Format string (basit)
 * @returns Formatlanmış tarih
 *
 * @example
 * ```typescript
 * formatDate(new Date(), 'YYYY-MM-DD');  // '2024-01-15'
 * ```
 */
export function formatDate(date: Date, format: string = 'YYYY-MM-DD'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

// ============================================================================
// DİĞER YARDIMCILAR
// ============================================================================

/**
 * Güvenli JSON parse
 *
 * @param text - JSON string
 * @param defaultValue - Parse başarısız olursa dönecek değer
 * @returns Parse edilmiş değer veya default
 */
export function safeJsonParse<T = unknown>(text: string, defaultValue?: T): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Benzersiz ID üretir (basit)
 *
 * @param length - ID uzunluğu (varsayılan: 8)
 * @returns Benzersiz ID
 */
export function generateId(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * URL path'lerini birleştirir
 *
 * @param parts - Path parçaları
 * @returns Birleştirilmiş path
 *
 * @example
 * ```typescript
 * joinUrl('/api/', '/users/', '/123');  // '/api/users/123'
 * joinUrl('https://api.com', 'v1', 'users'); // 'https://api.com/v1/users'
 * ```
 */
export function joinUrl(...parts: string[]): string {
  return parts
    .map((part, index) => {
      // İlk parça hariç baştaki / kaldır
      if (index > 0) {
        part = part.replace(/^\/+/, '');
      }
      // Son parça hariç sondaki / kaldır
      if (index < parts.length - 1) {
        part = part.replace(/\/+$/, '');
      }
      return part;
    })
    .filter(Boolean)
    .join('/');
}

/**
 * HTTP status kodundan açıklama döndürür
 *
 * @param statusCode - HTTP status kodu
 * @returns Status açıklaması
 */
export function getHttpStatusText(statusCode: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
  };

  return statusTexts[statusCode] || 'Unknown';
}

// Default export
export default {
  slugify,
  capitalize,
  toTitleCase,
  camelToKebab,
  kebabToCamel,
  snakeToCamel,
  truncate,
  padStart,
  padEnd,
  deepMerge,
  deepClone,
  removeEmpty,
  getByPath,
  setByPath,
  groupBy,
  unique,
  chunk,
  isString,
  isNumber,
  isBoolean,
  isObject,
  isArray,
  isNullish,
  isEmpty,
  sleep,
  formatDate,
  safeJsonParse,
  generateId,
  joinUrl,
  getHttpStatusText
};
