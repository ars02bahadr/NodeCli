/**
 * Apigen - Base Generator
 *
 * Bu modül, tüm Generator'ların temel sınıfını tanımlar.
 * Abstract class olarak tasarlanmıştır - doğrudan kullanılamaz.
 *
 * Generator'lar:
 * - ApiProject modelini alır
 * - Belirli bir formatta çıktı üretir (Postman, cURL, Markdown vb.)
 * - Dosyaya kaydeder veya string olarak döndürür
 *
 * Mevcut Generator implementasyonları:
 * - PostmanGenerator: Postman Collection v2.1 formatı
 * - CurlGenerator: Shell script olarak cURL komutları
 * - ReadmeGenerator: Markdown dokümantasyonu
 *
 * @module generators/base
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ApiProject,
  ApiGroup,
  ApiEndpoint,
  ApiParameter,
  ApiRequestBody,
  ApiResponse,
  ApiSchema,
  GeneratorOptions,
  GeneratorResult,
  HttpMethod,
  SchemaType
} from '../core/types';
import { Logger } from '../utils/logger';
import { ensureDir, writeFile } from '../utils/file-io';

// ============================================================================
// ABSTRACT BASE GENERATOR
// ============================================================================

/**
 * Base Generator - Soyut Temel Sınıf
 *
 * Tüm Generator'ların miras alması gereken temel sınıf.
 *
 * @abstract
 */
export abstract class BaseGenerator {
  /** Logger instance */
  protected readonly logger: Logger;

  /** Generator'ın adı (loglama için) */
  protected abstract readonly name: string;

  /** Varsayılan dosya adı (uzantısız) */
  protected abstract readonly defaultFileName: string;

  /** Varsayılan dosya uzantısı */
  protected abstract readonly fileExtension: string;

  /**
   * BaseGenerator constructor
   *
   * @param logger - Logger instance (opsiyonel)
   */
  constructor(logger?: Logger) {
    this.logger = logger || new Logger(false);
  }

  /**
   * Çıktı üretir ve dosyaya kaydeder
   *
   * Ana generation metodu - her implementasyon tarafından override edilmeli.
   *
   * @param project - API projesi
   * @param options - Generator seçenekleri
   * @returns Generator sonucu
   *
   * @abstract
   */
  public abstract generate(
    project: ApiProject,
    options: GeneratorOptions
  ): Promise<GeneratorResult>;

  /**
   * Başarılı sonuç oluşturur
   *
   * @param files - Oluşturulan dosya yolları
   * @param warnings - Uyarı mesajları (opsiyonel)
   * @returns GeneratorResult
   */
  protected createSuccessResult(files: string[], warnings?: string[]): GeneratorResult {
    return {
      success: true,
      files,
      warnings
    };
  }

  /**
   * Başarısız sonuç oluşturur
   *
   * @param errors - Hata mesajları
   * @param warnings - Uyarı mesajları (opsiyonel)
   * @returns GeneratorResult
   */
  protected createErrorResult(errors: string[], warnings?: string[]): GeneratorResult {
    return {
      success: false,
      files: [],
      errors,
      warnings
    };
  }

  /**
   * Dosyaya yazar
   *
   * Gerekirse dizini oluşturur.
   *
   * @param filePath - Hedef dosya yolu
   * @param content - Dosya içeriği
   * @returns Başarılı ise true
   */
  protected async saveToFile(filePath: string, content: string): Promise<boolean> {
    const dir = path.dirname(filePath);
    await ensureDir(dir);
    return writeFile(filePath, content);
  }

  /**
   * JSON formatında dosyaya yazar
   *
   * @param filePath - Hedef dosya yolu
   * @param data - JSON verisi
   * @param pretty - Pretty print (varsayılan: true)
   * @returns Başarılı ise true
   */
  protected async saveJsonToFile(
    filePath: string,
    data: unknown,
    pretty: boolean = true
  ): Promise<boolean> {
    const content = pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);

    return this.saveToFile(filePath, content);
  }

  /**
   * Çıktı dosya yolunu oluşturur
   *
   * @param options - Generator seçenekleri
   * @param subDir - Alt dizin (opsiyonel)
   * @returns Dosya yolu
   */
  protected getOutputPath(options: GeneratorOptions, subDir?: string): string {
    const fileName = options.fileName || this.defaultFileName;
    const fullFileName = `${fileName}${this.fileExtension}`;

    if (subDir) {
      return path.join(options.outputDir, subDir, fullFileName);
    }

    return path.join(options.outputDir, fullFileName);
  }

  /**
   * Schema'dan örnek değer üretir
   *
   * Mock data resolver çalışmadıysa fallback olarak kullanılır.
   *
   * @param schema - API şeması
   * @returns Örnek değer
   */
  protected generateExampleFromSchema(schema: ApiSchema): unknown {
    // Varsa mevcut örneği kullan
    if (schema.example !== undefined) {
      return schema.example;
    }

    // Varsayılan değer varsa onu kullan
    if (schema.default !== undefined) {
      return schema.default;
    }

    // Enum varsa ilk değeri kullan
    if (schema.enum && schema.enum.length > 0) {
      return schema.enum[0];
    }

    // Tipe göre örnek üret
    switch (schema.type) {
      case SchemaType.STRING:
        return this.generateStringExample(schema);

      case SchemaType.INTEGER:
        return 1;

      case SchemaType.NUMBER:
        return 1.5;

      case SchemaType.BOOLEAN:
        return true;

      case SchemaType.ARRAY:
        if (schema.items) {
          return [this.generateExampleFromSchema(schema.items)];
        }
        return [];

      case SchemaType.OBJECT:
        return this.generateObjectExample(schema);

      case SchemaType.NULL:
        return null;

      default:
        return 'string';
    }
  }

  /**
   * String tipi için örnek değer üretir
   *
   * Format'a göre uygun değer döndürür.
   *
   * @param schema - String şeması
   * @returns Örnek string
   */
  private generateStringExample(schema: ApiSchema): string {
    const format = schema.format?.toLowerCase();

    switch (format) {
      case 'email':
        return 'user@example.com';
      case 'uri':
      case 'url':
        return 'https://example.com';
      case 'uuid':
        return '550e8400-e29b-41d4-a716-446655440000';
      case 'date':
        return '2024-01-15';
      case 'date-time':
        return '2024-01-15T10:30:00Z';
      case 'time':
        return '10:30:00';
      case 'password':
        return '********';
      case 'byte':
        return 'SGVsbG8gV29ybGQ=';
      case 'binary':
        return '<binary>';
      case 'ipv4':
        return '192.168.1.1';
      case 'ipv6':
        return '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      default:
        return 'string';
    }
  }

  /**
   * Object tipi için örnek değer üretir
   *
   * @param schema - Object şeması
   * @returns Örnek object
   */
  private generateObjectExample(schema: ApiSchema): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        result[key] = this.generateExampleFromSchema(propSchema);
      }
    }

    return result;
  }

  /**
   * HTTP metodunun body gerektirip gerektirmediğini kontrol eder
   *
   * @param method - HTTP metodu
   * @returns Body gerekli ise true
   */
  protected methodRequiresBody(method: HttpMethod): boolean {
    return [HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH].includes(method);
  }

  /**
   * URL'i değişkenlerle birleştirir
   *
   * @param baseUrl - Base URL
   * @param path - Endpoint path
   * @param params - Query parametreleri
   * @returns Tam URL
   */
  protected buildUrl(
    baseUrl: string,
    path: string,
    params?: ApiParameter[]
  ): string {
    let url = baseUrl.replace(/\/$/, '') + path;

    // Query parametrelerini ekle
    const queryParams = params?.filter(p => p.in === 'query') || [];
    if (queryParams.length > 0) {
      const queryString = queryParams
        .map(p => `${p.name}=${encodeURIComponent(String(p.example || ''))}`)
        .join('&');
      url += `?${queryString}`;
    }

    return url;
  }

  /**
   * Path parametrelerini değerlerle değiştirir
   *
   * @param path - Path template
   * @param params - Path parametreleri
   * @returns Değerlerle doldurulmuş path
   */
  protected fillPathParams(path: string, params?: ApiParameter[]): string {
    let result = path;

    const pathParams = params?.filter(p => p.in === 'path') || [];
    for (const param of pathParams) {
      const value = param.example || `{${param.name}}`;
      result = result.replace(`{${param.name}}`, String(value));
    }

    return result;
  }

  /**
   * Debug log yazar
   */
  protected debug(message: string, ...args: unknown[]): void {
    this.logger.debug(`[${this.name}] ${message}`, ...args);
  }

  /**
   * Info log yazar
   */
  protected info(message: string, ...args: unknown[]): void {
    this.logger.info(`[${this.name}] ${message}`, ...args);
  }

  /**
   * Warning log yazar
   */
  protected warn(message: string, ...args: unknown[]): void {
    this.logger.warn(`[${this.name}] ${message}`, ...args);
  }

  /**
   * Error log yazar
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
  GeneratorOptions,
  GeneratorResult,
  HttpMethod,
  SchemaType
};

export default BaseGenerator;
