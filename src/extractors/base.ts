/**
 * Apigen - Base Extractor
 *
 * Bu modül, tüm Extractor'ların temel sınıfını tanımlar.
 * Abstract class olarak tasarlanmıştır - doğrudan kullanılamaz.
 *
 * Extractor'lar:
 * - Kaynak kodları veya spec dosyalarını okur
 * - API bilgilerini çıkarır (endpoint, parametre, schema vb.)
 * - Standart ApiProject formatına dönüştürür
 *
 * Her framework için ayrı bir Extractor implementasyonu vardır:
 * - OpenApiExtractor: Swagger/OpenAPI spec dosyaları
 * - FastApiExtractor: Python FastAPI projeleri
 * - FlaskExtractor: Python Flask projeleri
 * - SpringBootExtractor: Java Spring Boot projeleri
 * - AspNetExtractor: .NET ASP.NET Core projeleri
 *
 * @module extractors/base
 */

import {
  ApiProject,
  ApiGroup,
  ApiEndpoint,
  ApiParameter,
  ApiRequestBody,
  ApiResponse,
  ApiSchema,
  ApiInfo,
  ApiConfig,
  ApigenConfig,
  ExtractorResult,
  ProjectType,
  HttpMethod,
  ParameterLocation,
  SchemaType,
  AuthType
} from '../core/types';
import { Logger } from '../utils/logger';

// ============================================================================
// ABSTRACT BASE EXTRACTOR
// ============================================================================

/**
 * Base Extractor - Soyut Temel Sınıf
 *
 * Tüm Extractor'ların miras alması gereken temel sınıf.
 * Ortak işlevsellik ve zorunlu metodları tanımlar.
 *
 * @abstract
 */
export abstract class BaseExtractor {
  /** Logger instance */
  protected readonly logger: Logger;

  /** Extractor'ın desteklediği proje tipi */
  protected abstract readonly projectType: ProjectType;

  /** Extractor'ın adı (loglama için) */
  protected abstract readonly name: string;

  /**
   * BaseExtractor constructor
   *
   * @param logger - Logger instance (opsiyonel)
   */
  constructor(logger?: Logger) {
    this.logger = logger || new Logger(false);
  }

  /**
   * API bilgilerini çıkarır
   *
   * Ana extraction metodu - her implementasyon tarafından override edilmeli.
   *
   * @param source - Kaynak dosya/dizin yolu veya URL
   * @param config - Apigen konfigürasyonu
   * @returns Extraction sonucu
   *
   * @abstract
   */
  public abstract extract(source: string, config: ApigenConfig): Promise<ExtractorResult>;

  /**
   * Kaynağın geçerli olup olmadığını kontrol eder
   *
   * @param source - Kaynak yolu
   * @returns Geçerli ise true
   */
  protected validateSource(source: string): boolean {
    // Alt sınıflar override edebilir
    return !!source && source.length > 0;
  }

  /**
   * Başarılı extraction sonucu oluşturur
   *
   * @param project - Çıkarılan API projesi
   * @param filesProcessed - İşlenen dosya sayısı
   * @param warnings - Uyarı mesajları (opsiyonel)
   * @returns ExtractorResult
   */
  protected createSuccessResult(
    project: ApiProject,
    filesProcessed: number = 1,
    warnings?: string[]
  ): ExtractorResult {
    const endpointsFound = project.groups.reduce(
      (sum, group) => sum + group.endpoints.length,
      0
    );

    return {
      success: true,
      project,
      warnings,
      filesProcessed,
      endpointsFound
    };
  }

  /**
   * Başarısız extraction sonucu oluşturur
   *
   * @param errors - Hata mesajları
   * @param warnings - Uyarı mesajları (opsiyonel)
   * @returns ExtractorResult
   */
  protected createErrorResult(errors: string[], warnings?: string[]): ExtractorResult {
    return {
      success: false,
      errors,
      warnings,
      filesProcessed: 0,
      endpointsFound: 0
    };
  }

  /**
   * Boş ApiProject oluşturur
   *
   * @param source - Kaynak yolu
   * @param config - Konfigürasyon
   * @returns Boş ApiProject
   */
  protected createEmptyProject(source: string, config: ApigenConfig): ApiProject {
    return {
      info: {
        title: 'API Documentation',
        version: '1.0.0'
      },
      config: {
        baseUrl: config.baseUrl,
        outputDir: config.output,
        generateMockData: config.mockData.enabled,
        mockLocale: config.mockData.locale,
        mockSeed: config.mockData.seed
      },
      auth: config.auth ? {
        type: config.auth.type,
        keyName: config.auth.keyName,
        keyLocation: config.auth.keyLocation,
        tokenPlaceholder: config.auth.tokenPlaceholder
      } : undefined,
      groups: [],
      projectType: this.projectType,
      sourcePath: source
    };
  }

  /**
   * String'i HttpMethod'a dönüştürür
   *
   * @param method - HTTP metod string'i
   * @returns HttpMethod veya undefined
   */
  protected parseHttpMethod(method: string): HttpMethod | undefined {
    const upper = method.toUpperCase();
    const methods: Record<string, HttpMethod> = {
      'GET': HttpMethod.GET,
      'POST': HttpMethod.POST,
      'PUT': HttpMethod.PUT,
      'DELETE': HttpMethod.DELETE,
      'PATCH': HttpMethod.PATCH,
      'OPTIONS': HttpMethod.OPTIONS,
      'HEAD': HttpMethod.HEAD
    };

    return methods[upper];
  }

  /**
   * String'i ParameterLocation'a dönüştürür
   *
   * @param location - Konum string'i
   * @returns ParameterLocation veya PATH
   */
  protected parseParameterLocation(location: string): ParameterLocation {
    const lower = location.toLowerCase();
    const locations: Record<string, ParameterLocation> = {
      'path': ParameterLocation.PATH,
      'query': ParameterLocation.QUERY,
      'header': ParameterLocation.HEADER,
      'cookie': ParameterLocation.COOKIE
    };

    return locations[lower] || ParameterLocation.PATH;
  }

  /**
   * String'i SchemaType'a dönüştürür
   *
   * @param type - Tip string'i
   * @returns SchemaType veya STRING
   */
  protected parseSchemaType(type: string): SchemaType {
    const lower = type.toLowerCase();
    const types: Record<string, SchemaType> = {
      'string': SchemaType.STRING,
      'str': SchemaType.STRING,
      'number': SchemaType.NUMBER,
      'float': SchemaType.NUMBER,
      'double': SchemaType.NUMBER,
      'decimal': SchemaType.NUMBER,
      'integer': SchemaType.INTEGER,
      'int': SchemaType.INTEGER,
      'long': SchemaType.INTEGER,
      'boolean': SchemaType.BOOLEAN,
      'bool': SchemaType.BOOLEAN,
      'array': SchemaType.ARRAY,
      'list': SchemaType.ARRAY,
      'object': SchemaType.OBJECT,
      'dict': SchemaType.OBJECT,
      'map': SchemaType.OBJECT,
      'null': SchemaType.NULL,
      'none': SchemaType.NULL
    };

    return types[lower] || SchemaType.STRING;
  }

  /**
   * Path'ten path parametrelerini çıkarır
   *
   * @param path - URL path (örn: /users/{id}/posts/{postId})
   * @returns Parametre isimleri
   *
   * @example
   * ```typescript
   * extractPathParams('/users/{id}/posts/{postId}');
   * // ['id', 'postId']
   * ```
   */
  protected extractPathParams(path: string): string[] {
    const regex = /\{([^}]+)\}/g;
    const params: string[] = [];
    let match;

    while ((match = regex.exec(path)) !== null) {
      params.push(match[1]);
    }

    return params;
  }

  /**
   * Path'i normalize eder
   *
   * - Başına / ekler (yoksa)
   * - Sondaki / kaldırır
   * - Çift / temizler
   *
   * @param path - Normalize edilecek path
   * @returns Normalize edilmiş path
   */
  protected normalizePath(path: string): string {
    let normalized = path;

    // Başına / ekle
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }

    // Sondaki / kaldır (kök path hariç)
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    // Çift / temizle
    normalized = normalized.replace(/\/+/g, '/');

    return normalized;
  }

  /**
   * Endpoint'leri tag/controller bazında gruplar
   *
   * @param endpoints - Gruplanacak endpoint'ler
   * @param getGroupName - Grup adını döndüren fonksiyon
   * @returns ApiGroup dizisi
   */
  protected groupEndpoints(
    endpoints: ApiEndpoint[],
    getGroupName: (endpoint: ApiEndpoint) => string
  ): ApiGroup[] {
    const groupMap = new Map<string, ApiEndpoint[]>();

    for (const endpoint of endpoints) {
      const groupName = getGroupName(endpoint);

      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, []);
      }

      groupMap.get(groupName)!.push(endpoint);
    }

    return Array.from(groupMap.entries()).map(([name, eps]) => ({
      name,
      endpoints: eps
    }));
  }

  /**
   * Varsayılan response oluşturur
   *
   * @param statusCode - HTTP status kodu
   * @param description - Açıklama
   * @returns ApiResponse
   */
  protected createDefaultResponse(statusCode: number, description?: string): ApiResponse {
    return {
      statusCode,
      description: description || this.getStatusDescription(statusCode),
      contentType: 'application/json'
    };
  }

  /**
   * HTTP status kodundan açıklama döndürür
   *
   * @param statusCode - HTTP status kodu
   * @returns Açıklama
   */
  protected getStatusDescription(statusCode: number): string {
    const descriptions: Record<number, string> = {
      200: 'Successful response',
      201: 'Created',
      204: 'No content',
      400: 'Bad request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not found',
      422: 'Validation error',
      500: 'Internal server error'
    };

    return descriptions[statusCode] || 'Response';
  }

  /**
   * Debug log yazar
   *
   * @param message - Log mesajı
   * @param args - Ek argümanlar
   */
  protected debug(message: string, ...args: unknown[]): void {
    this.logger.debug(`[${this.name}] ${message}`, ...args);
  }

  /**
   * Info log yazar
   *
   * @param message - Log mesajı
   * @param args - Ek argümanlar
   */
  protected info(message: string, ...args: unknown[]): void {
    this.logger.info(`[${this.name}] ${message}`, ...args);
  }

  /**
   * Warning log yazar
   *
   * @param message - Log mesajı
   * @param args - Ek argümanlar
   */
  protected warn(message: string, ...args: unknown[]): void {
    this.logger.warn(`[${this.name}] ${message}`, ...args);
  }

  /**
   * Error log yazar
   *
   * @param message - Log mesajı
   * @param args - Ek argümanlar
   */
  protected error(message: string, ...args: unknown[]): void {
    this.logger.error(`[${this.name}] ${message}`, ...args);
  }
}

// Export types for convenience
export {
  ApiProject,
  ApiGroup,
  ApiEndpoint,
  ApiParameter,
  ApiRequestBody,
  ApiResponse,
  ApiSchema,
  ApiInfo,
  ApiConfig,
  ApigenConfig,
  ExtractorResult,
  ProjectType,
  HttpMethod,
  ParameterLocation,
  SchemaType,
  AuthType
};

export default BaseExtractor;
