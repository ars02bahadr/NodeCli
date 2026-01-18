/**
 * Apigen - Tip Tanımları
 *
 * Bu dosya, tüm projenin temelini oluşturan TypeScript interface'lerini içerir.
 * Extractor'lar bu tiplere dönüştürür, Generator'lar bu tiplerden okur.
 *
 * @module core/types
 * @author Apigen Team
 * @version 1.0.0
 */

// ============================================================================
// ENUM TANIMLAMALARI
// ============================================================================

/**
 * Desteklenen proje/framework tipleri
 *
 * Detector modülü tarafından algılanan proje tipini temsil eder.
 * Her tip için özel bir Extractor bulunur.
 */
export enum ProjectType {
  /** OpenAPI/Swagger spec dosyası (en güvenilir kaynak) */
  OPENAPI = 'openapi',

  /** Python FastAPI framework'ü */
  FASTAPI = 'fastapi',

  /** Python Flask framework'ü */
  FLASK = 'flask',

  /** Java Spring Boot framework'ü */
  SPRING_BOOT = 'spring-boot',

  /** .NET ASP.NET Core framework'ü */
  ASPNET_CORE = 'aspnet-core',

  /** Express.js (Node.js) - Gelecekte eklenecek */
  EXPRESS = 'express',

  /** Tip algılanamadı */
  UNKNOWN = 'unknown'
}

/**
 * HTTP metod tipleri
 *
 * REST API'lerde kullanılan standart HTTP metodları.
 * Büyük harfle tutulur (Postman ve cURL uyumluluğu için).
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  OPTIONS = 'OPTIONS',
  HEAD = 'HEAD'
}

/**
 * Parametre konumu
 *
 * API parametresinin request'in hangi bölümünde gönderileceğini belirtir.
 */
export enum ParameterLocation {
  /** URL path içinde (örn: /users/{id}) */
  PATH = 'path',

  /** Query string içinde (örn: ?page=1) */
  QUERY = 'query',

  /** HTTP header içinde (örn: Authorization) */
  HEADER = 'header',

  /** Cookie içinde */
  COOKIE = 'cookie'
}

/**
 * Kimlik doğrulama tipleri
 */
export enum AuthType {
  /** Bearer token (JWT vb.) */
  BEARER = 'bearer',

  /** API Key (header veya query) */
  API_KEY = 'apiKey',

  /** Basic Auth (kullanıcı:şifre base64) */
  BASIC = 'basic',

  /** OAuth 2.0 */
  OAUTH2 = 'oauth2',

  /** Kimlik doğrulama yok */
  NONE = 'none'
}

/**
 * Şema veri tipleri
 *
 * JSON Schema / OpenAPI'de desteklenen temel veri tipleri.
 */
export enum SchemaType {
  STRING = 'string',
  NUMBER = 'number',
  INTEGER = 'integer',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
  NULL = 'null'
}

// ============================================================================
// ANA VERİ YAPILARI
// ============================================================================

/**
 * API Projesi - Ana Container
 *
 * Tüm API bilgilerini içeren üst düzey yapı.
 * Extractor'ların çıktısı bu formata dönüştürülür.
 *
 * @example
 * ```typescript
 * const project: ApiProject = {
 *   info: { title: 'My API', version: '1.0.0' },
 *   config: { baseUrl: 'http://localhost:3000' },
 *   groups: [...]
 * };
 * ```
 */
export interface ApiProject {
  /** API hakkında genel bilgiler */
  info: ApiInfo;

  /** Proje konfigürasyonu */
  config: ApiConfig;

  /** Kimlik doğrulama ayarları (opsiyonel) */
  auth?: ApiAuth;

  /** Endpoint grupları (controller/tag bazlı) */
  groups: ApiGroup[];

  /** Algılanan proje tipi */
  projectType: ProjectType;

  /** Kaynak dosya/dizin yolu */
  sourcePath: string;
}

/**
 * API Bilgileri
 *
 * OpenAPI info objesine karşılık gelir.
 * Dokümantasyon ve Postman collection metadata'sı için kullanılır.
 */
export interface ApiInfo {
  /** API başlığı */
  title: string;

  /** API versiyonu (semver formatı önerilir) */
  version: string;

  /** API açıklaması (opsiyonel) */
  description?: string;

  /** İletişim bilgileri (opsiyonel) */
  contact?: {
    name?: string;
    email?: string;
    url?: string;
  };

  /** Lisans bilgisi (opsiyonel) */
  license?: {
    name: string;
    url?: string;
  };

  /** Sunucu URL'leri (birden fazla ortam için) */
  servers?: Array<{
    url: string;
    description?: string;
  }>;
}

/**
 * API Konfigürasyonu
 *
 * Generator'ların kullanacağı genel ayarlar.
 */
export interface ApiConfig {
  /** Ana sunucu URL'i (environment variable placeholder olabilir) */
  baseUrl: string;

  /** Çıktı dizini */
  outputDir: string;

  /** Mock data üretilsin mi? */
  generateMockData: boolean;

  /** Mock data için locale (tr, en, vb.) */
  mockLocale: string;

  /** Mock data seed değeri (tekrarlanabilirlik için) */
  mockSeed?: number;
}

/**
 * Kimlik Doğrulama Ayarları
 *
 * API'nin beklediği auth mekanizmasını tanımlar.
 * Postman collection ve cURL scriptlerinde kullanılır.
 */
export interface ApiAuth {
  /** Auth tipi */
  type: AuthType;

  /** Header veya query param adı (API Key için) */
  keyName?: string;

  /** Key'in konumu: header veya query (API Key için) */
  keyLocation?: 'header' | 'query';

  /** Placeholder değişken adı (örn: {{token}}) */
  tokenPlaceholder: string;

  /** OAuth2 scope'ları (opsiyonel) */
  scopes?: string[];
}

/**
 * API Endpoint Grubu
 *
 * İlişkili endpoint'lerin mantıksal gruplandırması.
 * OpenAPI'de tag, Controller sınıfları, veya route prefix'lerine karşılık gelir.
 * Postman'de folder olarak görünür.
 *
 * @example
 * ```typescript
 * const usersGroup: ApiGroup = {
 *   name: 'Users',
 *   description: 'Kullanıcı yönetimi endpoint\'leri',
 *   basePath: '/api/users',
 *   endpoints: [...]
 * };
 * ```
 */
export interface ApiGroup {
  /** Grup adı (tag veya controller adı) */
  name: string;

  /** Grup açıklaması (opsiyonel) */
  description?: string;

  /** Ortak path prefix (opsiyonel) */
  basePath?: string;

  /** Bu gruba ait endpoint'ler */
  endpoints: ApiEndpoint[];
}

/**
 * API Endpoint
 *
 * Tek bir API endpoint'ini tam olarak tanımlar.
 * Extractor'ların çıkardığı temel birim.
 *
 * @example
 * ```typescript
 * const endpoint: ApiEndpoint = {
 *   method: HttpMethod.POST,
 *   path: '/users',
 *   summary: 'Yeni kullanıcı oluştur',
 *   parameters: [...],
 *   requestBody: { schema: {...}, example: {...} },
 *   responses: [...]
 * };
 * ```
 */
export interface ApiEndpoint {
  /** HTTP metodu */
  method: HttpMethod;

  /** Endpoint path'i (path parametreleri ile birlikte, örn: /users/{id}) */
  path: string;

  /** Kısa özet (Postman request adı olarak kullanılır) */
  summary?: string;

  /** Detaylı açıklama */
  description?: string;

  /** Benzersiz operasyon ID'si (opsiyonel) */
  operationId?: string;

  /** OpenAPI tag'leri */
  tags?: string[];

  /** Path, query ve header parametreleri */
  parameters: ApiParameter[];

  /** Request body (POST, PUT, PATCH için) */
  requestBody?: ApiRequestBody;

  /** Olası response'lar */
  responses: ApiResponse[];

  /** Endpoint deprecated mi? */
  deprecated?: boolean;

  /** Endpoint-spesifik auth ayarları (global override) */
  security?: ApiAuth[];
}

/**
 * API Parametresi
 *
 * Path, query, header veya cookie parametresini tanımlar.
 *
 * @example
 * ```typescript
 * const pageParam: ApiParameter = {
 *   name: 'page',
 *   in: ParameterLocation.QUERY,
 *   required: false,
 *   schema: { type: SchemaType.INTEGER },
 *   description: 'Sayfa numarası',
 *   example: 1
 * };
 * ```
 */
export interface ApiParameter {
  /** Parametre adı */
  name: string;

  /** Parametrenin konumu */
  in: ParameterLocation;

  /** Zorunlu mu? */
  required: boolean;

  /** Parametre şeması (tip bilgisi) */
  schema: ApiSchema;

  /** Açıklama */
  description?: string;

  /** Örnek değer */
  example?: unknown;

  /** Varsayılan değer */
  defaultValue?: unknown;

  /** Deprecated mi? */
  deprecated?: boolean;
}

/**
 * Request Body
 *
 * POST, PUT, PATCH metodları için gövde tanımı.
 *
 * @example
 * ```typescript
 * const body: ApiRequestBody = {
 *   required: true,
 *   contentType: 'application/json',
 *   schema: {
 *     type: SchemaType.OBJECT,
 *     properties: {
 *       name: { type: SchemaType.STRING },
 *       email: { type: SchemaType.STRING }
 *     }
 *   },
 *   example: { name: 'John', email: 'john@example.com' }
 * };
 * ```
 */
export interface ApiRequestBody {
  /** Zorunlu mu? */
  required: boolean;

  /** Content-Type (genellikle application/json) */
  contentType: string;

  /** Body şeması */
  schema: ApiSchema;

  /** Açıklama */
  description?: string;

  /** Örnek veri (mock data veya spec'ten) */
  example?: unknown;
}

/**
 * API Response
 *
 * Bir endpoint'in olası response'larından biri.
 *
 * @example
 * ```typescript
 * const successResponse: ApiResponse = {
 *   statusCode: 200,
 *   description: 'Başarılı',
 *   contentType: 'application/json',
 *   schema: { type: SchemaType.OBJECT, ... },
 *   example: { id: 1, name: 'John' }
 * };
 * ```
 */
export interface ApiResponse {
  /** HTTP status kodu */
  statusCode: number;

  /** Response açıklaması */
  description: string;

  /** Content-Type (opsiyonel, bazı response'lar body içermez) */
  contentType?: string;

  /** Response şeması (opsiyonel) */
  schema?: ApiSchema;

  /** Örnek response (opsiyonel) */
  example?: unknown;

  /** Response header'ları (opsiyonel) */
  headers?: Record<string, ApiSchema>;
}

/**
 * API Şeması - Recursive Tip Tanımı
 *
 * JSON Schema benzeri, recursive veri yapısı tanımı.
 * Object ve array tipleri nested schema içerebilir.
 *
 * @example
 * ```typescript
 * // Basit string tipi
 * const nameSchema: ApiSchema = { type: SchemaType.STRING };
 *
 * // Object tipi
 * const userSchema: ApiSchema = {
 *   type: SchemaType.OBJECT,
 *   properties: {
 *     id: { type: SchemaType.INTEGER },
 *     name: { type: SchemaType.STRING },
 *     tags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
 *   },
 *   required: ['id', 'name']
 * };
 * ```
 */
export interface ApiSchema {
  /** Veri tipi */
  type: SchemaType;

  /** Format (string için: email, date-time, uuid, vb.) */
  format?: string;

  /** Object properties (type: object için) */
  properties?: Record<string, ApiSchema>;

  /** Zorunlu alanlar (type: object için) */
  required?: string[];

  /** Array item şeması (type: array için) */
  items?: ApiSchema;

  /** Enum değerleri (sabit değer listesi) */
  enum?: unknown[];

  /** Referans şema adı (örn: User, Product) */
  $ref?: string;

  /** Açıklama */
  description?: string;

  /** Örnek değer */
  example?: unknown;

  /** Varsayılan değer */
  default?: unknown;

  /** Minimum değer (number/integer için) */
  minimum?: number;

  /** Maximum değer (number/integer için) */
  maximum?: number;

  /** Minimum uzunluk (string için) */
  minLength?: number;

  /** Maximum uzunluk (string için) */
  maxLength?: number;

  /** Regex pattern (string için) */
  pattern?: string;

  /** Nullable mı? */
  nullable?: boolean;

  /** Additional properties izni (object için) */
  additionalProperties?: boolean | ApiSchema;

  /** OneOf şemaları (polimorfizm) */
  oneOf?: ApiSchema[];

  /** AnyOf şemaları */
  anyOf?: ApiSchema[];

  /** AllOf şemaları (inheritance) */
  allOf?: ApiSchema[];
}

// ============================================================================
// EXTRACTOR VE GENERATOR TİPLERİ
// ============================================================================

/**
 * Extractor Sonucu
 *
 * Bir Extractor'ın extract() metodunun dönüş tipi.
 * Başarılı veya hatalı durumu işaretler.
 */
export interface ExtractorResult {
  /** İşlem başarılı mı? */
  success: boolean;

  /** Çıkarılan API projesi (başarılı ise) */
  project?: ApiProject;

  /** Hata mesajları (başarısız ise) */
  errors?: string[];

  /** Uyarılar (başarılı olsa bile olabilir) */
  warnings?: string[];

  /** İşlenen dosya sayısı */
  filesProcessed?: number;

  /** Bulunan endpoint sayısı */
  endpointsFound?: number;
}

/**
 * Generator Seçenekleri
 *
 * Generator'lara geçirilen konfigürasyon.
 */
export interface GeneratorOptions {
  /** Çıktı dizini */
  outputDir: string;

  /** Dosya adı (uzantısız) */
  fileName?: string;

  /** Üzerine yazılsın mı? */
  overwrite: boolean;

  /** Pretty print (formatlanmış JSON/YAML) */
  prettyPrint: boolean;

  /** Include examples in output */
  includeExamples: boolean;
}

/**
 * Generator Sonucu
 *
 * Bir Generator'ın generate() metodunun dönüş tipi.
 */
export interface GeneratorResult {
  /** İşlem başarılı mı? */
  success: boolean;

  /** Oluşturulan dosya yolları */
  files: string[];

  /** Hata mesajları */
  errors?: string[];

  /** Uyarılar */
  warnings?: string[];
}

// ============================================================================
// KONFİGÜRASYON TİPLERİ
// ============================================================================

/**
 * Apigen Config Dosyası Yapısı
 *
 * apigen.config.json dosyasının şeması.
 * CLI argümanları ile merge edilir.
 */
export interface ApigenConfig {
  /** Kaynak (auto, dosya yolu veya URL) */
  source: string;

  /** Çıktı dizini */
  output: string;

  /** Base URL */
  baseUrl: string;

  /** Auth ayarları */
  auth?: {
    type: AuthType;
    keyName?: string;
    keyLocation?: 'header' | 'query';
    tokenPlaceholder: string;
  };

  /** Generator ayarları */
  generators: {
    postman: boolean;
    curl: boolean;
    readme: boolean;
  };

  /** Mock data ayarları */
  mockData: {
    enabled: boolean;
    locale: string;
    seed?: number;
  };

  /** Framework tipi (auto ise algılanır) */
  framework?: ProjectType | 'auto';

  /** Verbose logging */
  verbose?: boolean;
}

/**
 * CLI Argümanları
 *
 * Commander tarafından parse edilen argümanlar.
 */
export interface CliArguments {
  source?: string;
  output?: string;
  framework?: string;
  postman?: boolean;
  curl?: boolean;
  readme?: boolean;
  all?: boolean;
  noMock?: boolean;
  verbose?: boolean;
  watch?: boolean;
}

// ============================================================================
// YARDIMCI TİPLER
// ============================================================================

/**
 * Proje Algılama Sonucu
 *
 * Detector'ın döndürdüğü detaylı sonuç.
 */
export interface DetectionResult {
  /** Algılanan proje tipi */
  type: ProjectType;

  /** Güvenilirlik skoru (0-100) */
  confidence: number;

  /** Algılama nedenleri */
  reasons: string[];

  /** Bulunan spec dosyası (varsa) */
  specFile?: string;

  /** Bulunan proje dosyaları */
  projectFiles: string[];

  /** Tahmini endpoint sayısı */
  estimatedEndpoints?: number;
}

/**
 * Dosya Bilgisi
 *
 * Taranan bir kaynak dosya hakkında bilgi.
 */
export interface FileInfo {
  /** Dosya yolu (mutlak) */
  path: string;

  /** Dosya adı */
  name: string;

  /** Dosya uzantısı */
  extension: string;

  /** Dosya boyutu (bytes) */
  size: number;

  /** Son değişiklik tarihi */
  modifiedAt: Date;
}

/**
 * İşlem İlerlemesi
 *
 * Uzun süren işlemler için ilerleme bilgisi.
 * Logger tarafından kullanılır.
 */
export interface ProgressInfo {
  /** Mevcut adım */
  current: number;

  /** Toplam adım sayısı */
  total: number;

  /** Mevcut işlem açıklaması */
  message: string;

  /** Yüzde (0-100) */
  percentage: number;
}

// ============================================================================
// TİP GUARD'LARI
// ============================================================================

/**
 * Bir değerin ApiSchema olup olmadığını kontrol eder
 *
 * @param value - Kontrol edilecek değer
 * @returns value ApiSchema ise true
 */
export function isApiSchema(value: unknown): value is ApiSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    Object.values(SchemaType).includes((value as ApiSchema).type)
  );
}

/**
 * Bir string'in geçerli HttpMethod olup olmadığını kontrol eder
 *
 * @param value - Kontrol edilecek string
 * @returns value HttpMethod ise true
 */
export function isHttpMethod(value: string): value is HttpMethod {
  return Object.values(HttpMethod).includes(value as HttpMethod);
}

/**
 * Bir string'i HttpMethod'a dönüştürür
 *
 * @param method - HTTP metod string'i (case insensitive)
 * @returns HttpMethod enum değeri veya undefined
 */
export function toHttpMethod(method: string): HttpMethod | undefined {
  const upper = method.toUpperCase();
  if (isHttpMethod(upper)) {
    return upper as HttpMethod;
  }
  return undefined;
}
