/**
 * Apigen - OpenAPI/Swagger Extractor
 *
 * Bu modül, OpenAPI 3.x ve Swagger 2.0 spec dosyalarını parse eder.
 * swagger-parser kütüphanesi kullanılarak dereference ve validation yapılır.
 *
 * Desteklenen formatlar:
 * - OpenAPI 3.0.x
 * - OpenAPI 3.1.x
 * - Swagger 2.0
 *
 * Desteklenen dosya tipleri:
 * - JSON (.json)
 * - YAML (.yaml, .yml)
 * - URL'den okuma
 *
 * Özellikler:
 * - Circular reference handling
 * - Schema dereferencing ($ref çözümleme)
 * - Tüm HTTP metodları desteği
 * - Request body ve response schema parsing
 * - Security scheme desteği
 *
 * @module extractors/openapi
 */

import * as fs from 'fs';
import * as path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';
import {
  BaseExtractor,
  ApiProject,
  ApiGroup,
  ApiEndpoint,
  ApiParameter,
  ApiRequestBody,
  ApiResponse,
  ApiSchema,
  ApigenConfig,
  ExtractorResult,
  ProjectType,
  HttpMethod,
  ParameterLocation,
  SchemaType
} from './base';

// ============================================================================
// OpenAPI TİP TANIMLARI
// ============================================================================

/**
 * OpenAPI 3.x Document yapısı (basitleştirilmiş)
 */
interface OpenApiDocument {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
    description?: string;
    contact?: {
      name?: string;
      email?: string;
      url?: string;
    };
    license?: {
      name: string;
      url?: string;
    };
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, OpenApiPathItem>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  security?: Array<Record<string, string[]>>;
}

interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
  patch?: OpenApiOperation;
  options?: OpenApiOperation;
  head?: OpenApiOperation;
  parameters?: OpenApiParameter[];
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  deprecated?: boolean;
  security?: Array<Record<string, string[]>>;
}

interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
  example?: unknown;
  deprecated?: boolean;
}

interface OpenApiRequestBody {
  required?: boolean;
  description?: string;
  content: Record<string, {
    schema?: OpenApiSchema;
    example?: unknown;
    examples?: Record<string, { value: unknown }>;
  }>;
}

interface OpenApiResponse {
  description: string;
  content?: Record<string, {
    schema?: OpenApiSchema;
    example?: unknown;
  }>;
  headers?: Record<string, {
    schema?: OpenApiSchema;
    description?: string;
  }>;
}

interface OpenApiSchema {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  enum?: unknown[];
  $ref?: string;
  example?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  nullable?: boolean;
  additionalProperties?: boolean | OpenApiSchema;
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
}

interface OpenApiSecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: string;
  flows?: Record<string, unknown>;
}

// ============================================================================
// OPENAPI EXTRACTOR
// ============================================================================

/**
 * OpenAPI/Swagger Extractor
 *
 * OpenAPI spec dosyalarını ApiProject formatına dönüştürür.
 *
 * @example
 * ```typescript
 * const extractor = new OpenApiExtractor();
 * const result = await extractor.extract('./openapi.yaml', config);
 *
 * if (result.success) {
 *   console.log(`${result.endpointsFound} endpoint bulundu`);
 * }
 * ```
 */
export class OpenApiExtractor extends BaseExtractor {
  protected readonly projectType = ProjectType.OPENAPI;
  protected readonly name = 'OpenApiExtractor';

  /**
   * OpenAPI spec dosyasını parse eder ve ApiProject'e dönüştürür
   *
   * @param source - Spec dosyası yolu veya URL
   * @param config - Apigen konfigürasyonu
   * @returns Extraction sonucu
   */
  public async extract(source: string, config: ApigenConfig): Promise<ExtractorResult> {
    this.info(`OpenAPI spec parse ediliyor: ${source}`);

    try {
      // 1. Spec dosyasını parse et ve validate et
      const api = await this.parseSpec(source);

      if (!api) {
        return this.createErrorResult(['OpenAPI spec dosyası parse edilemedi']);
      }

      // 2. Boş proje oluştur
      const project = this.createEmptyProject(source, config);

      // 3. Info bilgilerini doldur
      project.info = {
        title: api.info.title,
        version: api.info.version,
        description: api.info.description,
        contact: api.info.contact,
        license: api.info.license,
        servers: api.servers
      };

      // 4. Base URL'i servers'dan al (varsa)
      if (api.servers && api.servers.length > 0) {
        project.config.baseUrl = api.servers[0].url;
      }

      // 5. Security scheme'den auth bilgisi çıkar
      if (api.components?.securitySchemes) {
        const auth = this.extractAuthFromSecuritySchemes(api.components.securitySchemes);
        if (auth) {
          project.auth = auth;
        }
      }

      // 6. Path'leri endpoint'lere dönüştür
      const endpoints = this.extractEndpoints(api);

      // 7. Endpoint'leri tag'lere göre grupla
      project.groups = this.groupEndpointsByTag(endpoints, api.tags);

      this.info(`${endpoints.length} endpoint başarıyla çıkarıldı`);

      return this.createSuccessResult(project, 1);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error(`Parse hatası: ${errorMessage}`);

      return this.createErrorResult([`OpenAPI parse hatası: ${errorMessage}`]);
    }
  }

  /**
   * Spec dosyasını swagger-parser ile parse eder
   *
   * @param source - Dosya yolu veya URL
   * @returns Parse edilmiş OpenAPI document
   */
  private async parseSpec(source: string): Promise<OpenApiDocument | null> {
    try {
      // Dereference: $ref'leri çözümle
      const api = await SwaggerParser.dereference(source) as unknown as OpenApiDocument;
      return api;
    } catch (error) {
      // Dereference başarısız olursa, bundle dene
      try {
        const api = await SwaggerParser.bundle(source) as unknown as OpenApiDocument;
        return api;
      } catch {
        return null;
      }
    }
  }

  /**
   * Security scheme'lerden auth bilgisi çıkarır
   *
   * @param schemes - Security scheme'ler
   * @returns Auth konfigürasyonu
   */
  private extractAuthFromSecuritySchemes(
    schemes: Record<string, OpenApiSecurityScheme>
  ): ApiProject['auth'] | undefined {
    // İlk geçerli scheme'i bul
    for (const [name, scheme] of Object.entries(schemes)) {
      if (scheme.type === 'http' && scheme.scheme === 'bearer') {
        return {
          type: 'bearer' as const,
          tokenPlaceholder: '{{token}}'
        };
      }

      if (scheme.type === 'apiKey') {
        return {
          type: 'apiKey' as const,
          keyName: scheme.name || 'X-API-Key',
          keyLocation: (scheme.in === 'query' ? 'query' : 'header') as 'header' | 'query',
          tokenPlaceholder: '{{apiKey}}'
        };
      }

      if (scheme.type === 'http' && scheme.scheme === 'basic') {
        return {
          type: 'basic' as const,
          tokenPlaceholder: '{{basicAuth}}'
        };
      }
    }

    return undefined;
  }

  /**
   * Tüm path'leri endpoint'lere dönüştürür
   *
   * @param api - OpenAPI document
   * @returns Endpoint dizisi
   */
  private extractEndpoints(api: OpenApiDocument): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];

    for (const [pathUrl, pathItem] of Object.entries(api.paths)) {
      // Path-level parametreler
      const pathParams = pathItem.parameters || [];

      // Her HTTP metodu için
      const methods: Array<{ method: HttpMethod; operation?: OpenApiOperation }> = [
        { method: HttpMethod.GET, operation: pathItem.get },
        { method: HttpMethod.POST, operation: pathItem.post },
        { method: HttpMethod.PUT, operation: pathItem.put },
        { method: HttpMethod.DELETE, operation: pathItem.delete },
        { method: HttpMethod.PATCH, operation: pathItem.patch },
        { method: HttpMethod.OPTIONS, operation: pathItem.options },
        { method: HttpMethod.HEAD, operation: pathItem.head }
      ];

      for (const { method, operation } of methods) {
        if (!operation) continue;

        const endpoint = this.createEndpoint(pathUrl, method, operation, pathParams);
        endpoints.push(endpoint);
      }
    }

    return endpoints;
  }

  /**
   * Tek bir endpoint oluşturur
   *
   * @param path - URL path
   * @param method - HTTP metodu
   * @param operation - OpenAPI operation
   * @param pathParams - Path-level parametreler
   * @returns ApiEndpoint
   */
  private createEndpoint(
    path: string,
    method: HttpMethod,
    operation: OpenApiOperation,
    pathParams: OpenApiParameter[]
  ): ApiEndpoint {
    // Parametreleri birleştir (path-level + operation-level)
    const allParams = [...pathParams, ...(operation.parameters || [])];
    const parameters = allParams.map(p => this.convertParameter(p));

    // Request body
    let requestBody: ApiRequestBody | undefined;
    if (operation.requestBody) {
      requestBody = this.convertRequestBody(operation.requestBody);
    }

    // Responses
    const responses = Object.entries(operation.responses).map(([code, resp]) =>
      this.convertResponse(parseInt(code, 10), resp)
    );

    return {
      method,
      path: this.normalizePath(path),
      summary: operation.summary,
      description: operation.description,
      operationId: operation.operationId,
      tags: operation.tags,
      parameters,
      requestBody,
      responses,
      deprecated: operation.deprecated
    };
  }

  /**
   * OpenAPI parametresini ApiParameter'a dönüştürür
   *
   * @param param - OpenAPI parametre
   * @returns ApiParameter
   */
  private convertParameter(param: OpenApiParameter): ApiParameter {
    return {
      name: param.name,
      in: this.parseParameterLocation(param.in),
      required: param.required || false,
      schema: param.schema ? this.convertSchema(param.schema) : { type: SchemaType.STRING },
      description: param.description,
      example: param.example,
      deprecated: param.deprecated
    };
  }

  /**
   * OpenAPI request body'yi ApiRequestBody'ye dönüştürür
   *
   * @param body - OpenAPI request body
   * @returns ApiRequestBody
   */
  private convertRequestBody(body: OpenApiRequestBody): ApiRequestBody {
    // Öncelikle JSON content'i ara
    const jsonContent = body.content['application/json'];
    const firstContent = jsonContent || Object.values(body.content)[0];
    const contentType = jsonContent ? 'application/json' : Object.keys(body.content)[0];

    let example = firstContent?.example;

    // examples varsa ilkini al
    if (!example && firstContent?.examples) {
      const firstExample = Object.values(firstContent.examples)[0];
      example = firstExample?.value;
    }

    return {
      required: body.required || false,
      contentType,
      schema: firstContent?.schema
        ? this.convertSchema(firstContent.schema)
        : { type: SchemaType.OBJECT },
      description: body.description,
      example
    };
  }

  /**
   * OpenAPI response'u ApiResponse'a dönüştürür
   *
   * @param statusCode - HTTP status kodu
   * @param response - OpenAPI response
   * @returns ApiResponse
   */
  private convertResponse(statusCode: number, response: OpenApiResponse): ApiResponse {
    const result: ApiResponse = {
      statusCode: isNaN(statusCode) ? 200 : statusCode,
      description: response.description
    };

    if (response.content) {
      const jsonContent = response.content['application/json'];
      const firstContent = jsonContent || Object.values(response.content)[0];

      if (firstContent) {
        result.contentType = jsonContent ? 'application/json' : Object.keys(response.content)[0];

        if (firstContent.schema) {
          result.schema = this.convertSchema(firstContent.schema);
        }

        if (firstContent.example) {
          result.example = firstContent.example;
        }
      }
    }

    return result;
  }

  /**
   * OpenAPI schema'yı ApiSchema'ya dönüştürür
   *
   * @param schema - OpenAPI schema
   * @returns ApiSchema
   */
  private convertSchema(schema: OpenApiSchema): ApiSchema {
    const result: ApiSchema = {
      type: this.parseSchemaType(schema.type || 'string')
    };

    // Format
    if (schema.format) {
      result.format = schema.format;
    }

    // Description
    if (schema.description) {
      result.description = schema.description;
    }

    // Example
    if (schema.example !== undefined) {
      result.example = schema.example;
    }

    // Default
    if (schema.default !== undefined) {
      result.default = schema.default;
    }

    // Enum
    if (schema.enum) {
      result.enum = schema.enum;
    }

    // Number constraints
    if (schema.minimum !== undefined) result.minimum = schema.minimum;
    if (schema.maximum !== undefined) result.maximum = schema.maximum;

    // String constraints
    if (schema.minLength !== undefined) result.minLength = schema.minLength;
    if (schema.maxLength !== undefined) result.maxLength = schema.maxLength;
    if (schema.pattern) result.pattern = schema.pattern;

    // Nullable
    if (schema.nullable) {
      result.nullable = true;
    }

    // Object properties
    if (schema.properties) {
      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result.properties[key] = this.convertSchema(value);
      }
    }

    // Required fields
    if (schema.required) {
      result.required = schema.required;
    }

    // Array items
    if (schema.items) {
      result.items = this.convertSchema(schema.items);
    }

    // Additional properties
    if (schema.additionalProperties !== undefined) {
      if (typeof schema.additionalProperties === 'boolean') {
        result.additionalProperties = schema.additionalProperties;
      } else {
        result.additionalProperties = this.convertSchema(schema.additionalProperties);
      }
    }

    // Composition (oneOf, anyOf, allOf)
    if (schema.oneOf) {
      result.oneOf = schema.oneOf.map(s => this.convertSchema(s));
    }
    if (schema.anyOf) {
      result.anyOf = schema.anyOf.map(s => this.convertSchema(s));
    }
    if (schema.allOf) {
      result.allOf = schema.allOf.map(s => this.convertSchema(s));
    }

    return result;
  }

  /**
   * Endpoint'leri tag'lere göre gruplar
   *
   * @param endpoints - Gruplanacak endpoint'ler
   * @param tags - Tag tanımları
   * @returns ApiGroup dizisi
   */
  private groupEndpointsByTag(
    endpoints: ApiEndpoint[],
    tags?: Array<{ name: string; description?: string }>
  ): ApiGroup[] {
    // Tag haritası oluştur
    const tagMap = new Map<string, { description?: string; endpoints: ApiEndpoint[] }>();

    // Tag tanımlarını ekle
    if (tags) {
      for (const tag of tags) {
        tagMap.set(tag.name, {
          description: tag.description,
          endpoints: []
        });
      }
    }

    // Default grup
    tagMap.set('default', { endpoints: [] });

    // Endpoint'leri gruplara dağıt
    for (const endpoint of endpoints) {
      const tagName = endpoint.tags?.[0] || 'default';

      if (!tagMap.has(tagName)) {
        tagMap.set(tagName, { endpoints: [] });
      }

      tagMap.get(tagName)!.endpoints.push(endpoint);
    }

    // Boş grupları filtrele ve ApiGroup'a dönüştür
    const groups: ApiGroup[] = [];

    for (const [name, data] of tagMap) {
      if (data.endpoints.length > 0) {
        groups.push({
          name,
          description: data.description,
          endpoints: data.endpoints
        });
      }
    }

    return groups;
  }
}

export default OpenApiExtractor;
