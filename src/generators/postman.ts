/**
 * Apigen - Postman Collection Generator
 *
 * Bu modül, ApiProject'i Postman Collection v2.1 formatına dönüştürür.
 *
 * Özellikler:
 * - Postman Collection v2.1 format desteği
 * - Collection seviyesinde auth tanımı (inherit from parent)
 * - ApiGroup'lar Postman Folder'larına dönüşür
 * - Her endpoint için Request oluşturulur
 * - Mock data request body'ye eklenir
 * - Environment variable'lar: {{baseUrl}}, {{token}}
 * - Pre-request ve test script desteği
 *
 * @module generators/postman
 */

import * as path from 'path';
import {
  BaseGenerator,
  ApiProject,
  ApiGroup,
  ApiEndpoint,
  ApiParameter,
  ApiSchema,
  GeneratorOptions,
  GeneratorResult,
  HttpMethod,
  SchemaType
} from './base';
import { AuthType } from '../core/types';

// ============================================================================
// POSTMAN COLLECTION TİPLERİ
// ============================================================================

/**
 * Postman Collection v2.1 root yapısı
 */
interface PostmanCollection {
  info: PostmanInfo;
  item: PostmanItem[];
  auth?: PostmanAuth;
  variable?: PostmanVariable[];
  event?: PostmanEvent[];
}

interface PostmanInfo {
  name: string;
  description?: string;
  schema: string;
  version?: string;
}

interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  response?: PostmanResponse[];
  event?: PostmanEvent[];
}

interface PostmanRequest {
  method: string;
  header: PostmanHeader[];
  url: PostmanUrl;
  body?: PostmanBody;
  description?: string;
  auth?: PostmanAuth;
}

interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  query?: PostmanQueryParam[];
  variable?: PostmanPathVariable[];
}

interface PostmanHeader {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

interface PostmanQueryParam {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

interface PostmanPathVariable {
  key: string;
  value: string;
  description?: string;
}

interface PostmanBody {
  mode: 'raw' | 'formdata' | 'urlencoded' | 'file' | 'graphql';
  raw?: string;
  options?: {
    raw?: {
      language: string;
    };
  };
}

interface PostmanAuth {
  type: 'bearer' | 'basic' | 'apikey' | 'noauth';
  bearer?: Array<{ key: string; value: string; type: string }>;
  basic?: Array<{ key: string; value: string; type: string }>;
  apikey?: Array<{ key: string; value: string; type: string }>;
}

interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
  description?: string;
}

interface PostmanEvent {
  listen: 'prerequest' | 'test';
  script: {
    type: 'text/javascript';
    exec: string[];
  };
}

interface PostmanResponse {
  name: string;
  originalRequest: PostmanRequest;
  status: string;
  code: number;
  body?: string;
  header?: PostmanHeader[];
}

// ============================================================================
// POSTMAN GENERATOR
// ============================================================================

/**
 * Postman Collection Generator
 *
 * ApiProject'i Postman Collection v2.1 formatına dönüştürür.
 *
 * @example
 * ```typescript
 * const generator = new PostmanGenerator();
 * const result = await generator.generate(project, {
 *   outputDir: './output',
 *   overwrite: true,
 *   prettyPrint: true,
 *   includeExamples: true
 * });
 * ```
 */
export class PostmanGenerator extends BaseGenerator {
  protected readonly name = 'PostmanGenerator';
  protected readonly defaultFileName = 'postman_collection';
  protected readonly fileExtension = '.json';

  /** Postman Collection v2.1 schema URL'i */
  private readonly SCHEMA_URL = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

  /**
   * Postman Collection üretir
   */
  public async generate(
    project: ApiProject,
    options: GeneratorOptions
  ): Promise<GeneratorResult> {
    this.info('Postman Collection üretiliyor...');

    try {
      // Collection oluştur
      const collection = this.buildCollection(project, options);

      // Dosyaya kaydet
      const outputPath = this.getOutputPath(options);
      const success = await this.saveJsonToFile(outputPath, collection, options.prettyPrint);

      if (!success) {
        return this.createErrorResult(['Dosya yazılamadı: ' + outputPath]);
      }

      this.debug(`Collection oluşturuldu: ${outputPath}`);

      return this.createSuccessResult([outputPath]);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error(`Generation hatası: ${errorMessage}`);

      return this.createErrorResult([`Postman generation hatası: ${errorMessage}`]);
    }
  }

  /**
   * Postman Collection yapısını oluşturur
   */
  private buildCollection(project: ApiProject, options: GeneratorOptions): PostmanCollection {
    // Info
    const info: PostmanInfo = {
      name: project.info.title,
      description: project.info.description,
      schema: this.SCHEMA_URL,
      version: project.info.version
    };

    // Auth
    const auth = project.auth ? this.buildAuth(project.auth) : undefined;

    // Variables
    const variables = this.buildVariables(project);

    // Items (folders and requests)
    const items = project.groups.map(group => this.buildFolder(group, project, options));

    // Collection-level events (opsiyonel)
    const events = this.buildCollectionEvents();

    return {
      info,
      item: items,
      auth,
      variable: variables,
      event: events
    };
  }

  /**
   * Auth yapısını oluşturur
   */
  private buildAuth(auth: NonNullable<ApiProject['auth']>): PostmanAuth {
    switch (auth.type) {
      case AuthType.BEARER:
        return {
          type: 'bearer',
          bearer: [
            {
              key: 'token',
              value: auth.tokenPlaceholder || '{{token}}',
              type: 'string'
            }
          ]
        };

      case AuthType.BASIC:
        return {
          type: 'basic',
          basic: [
            { key: 'username', value: '{{username}}', type: 'string' },
            { key: 'password', value: '{{password}}', type: 'string' }
          ]
        };

      case AuthType.API_KEY:
        return {
          type: 'apikey',
          apikey: [
            {
              key: 'key',
              value: auth.keyName || 'X-API-Key',
              type: 'string'
            },
            {
              key: 'value',
              value: auth.tokenPlaceholder || '{{apiKey}}',
              type: 'string'
            },
            {
              key: 'in',
              value: auth.keyLocation || 'header',
              type: 'string'
            }
          ]
        };

      default:
        return { type: 'noauth' };
    }
  }

  /**
   * Collection variable'larını oluşturur
   */
  private buildVariables(project: ApiProject): PostmanVariable[] {
    const variables: PostmanVariable[] = [
      {
        key: 'baseUrl',
        value: project.config.baseUrl,
        type: 'string',
        description: 'API base URL'
      }
    ];

    // Auth variable'ları
    if (project.auth) {
      if (project.auth.type === AuthType.BEARER) {
        variables.push({
          key: 'token',
          value: '',
          type: 'string',
          description: 'Bearer token'
        });
      } else if (project.auth.type === AuthType.API_KEY) {
        variables.push({
          key: 'apiKey',
          value: '',
          type: 'string',
          description: 'API Key'
        });
      }
    }

    return variables;
  }

  /**
   * Collection-level event'leri oluşturur
   */
  private buildCollectionEvents(): PostmanEvent[] {
    // Pre-request script - token yenileme vb. için kullanılabilir
    const prerequest: PostmanEvent = {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          '// Collection-level pre-request script',
          '// Burada token yenileme veya ortak setup işlemleri yapılabilir'
        ]
      }
    };

    // Test script - ortak validasyonlar için
    const test: PostmanEvent = {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          '// Collection-level test script',
          'pm.test("Response status is successful", function () {',
          '    pm.expect(pm.response.code).to.be.oneOf([200, 201, 204]);',
          '});'
        ]
      }
    };

    return [prerequest, test];
  }

  /**
   * Folder (grup) oluşturur
   */
  private buildFolder(
    group: ApiGroup,
    project: ApiProject,
    options: GeneratorOptions
  ): PostmanItem {
    const requests = group.endpoints.map(endpoint =>
      this.buildRequest(endpoint, project, options)
    );

    return {
      name: group.name,
      item: requests
    };
  }

  /**
   * Request oluşturur
   */
  private buildRequest(
    endpoint: ApiEndpoint,
    project: ApiProject,
    options: GeneratorOptions
  ): PostmanItem {
    // URL
    const url = this.buildPostmanUrl(endpoint, project.config.baseUrl);

    // Headers
    const headers = this.buildHeaders(endpoint);

    // Body
    const body = endpoint.requestBody
      ? this.buildBody(endpoint.requestBody, options)
      : undefined;

    // Request
    const request: PostmanRequest = {
      method: endpoint.method,
      header: headers,
      url,
      body,
      description: endpoint.description
    };

    // Response örnekleri
    const responses = options.includeExamples
      ? this.buildExampleResponses(endpoint, request)
      : undefined;

    return {
      name: endpoint.summary || `${endpoint.method} ${endpoint.path}`,
      request,
      response: responses
    };
  }

  /**
   * Postman URL yapısını oluşturur
   */
  private buildPostmanUrl(endpoint: ApiEndpoint, baseUrl: string): PostmanUrl {
    // Path'i parçala
    const pathParts = endpoint.path.split('/').filter(Boolean);

    // Path variable'ları çıkar ve değiştir
    const processedPath: string[] = [];
    const pathVariables: PostmanPathVariable[] = [];

    for (const part of pathParts) {
      if (part.startsWith('{') && part.endsWith('}')) {
        const varName = part.slice(1, -1);
        processedPath.push(`:${varName}`);

        const param = endpoint.parameters.find(p => p.name === varName && p.in === 'path');
        pathVariables.push({
          key: varName,
          value: param?.example ? String(param.example) : '',
          description: param?.description
        });
      } else {
        processedPath.push(part);
      }
    }

    // Query parametreleri
    const queryParams = endpoint.parameters
      .filter(p => p.in === 'query')
      .map(p => ({
        key: p.name,
        value: p.example ? String(p.example) : '',
        description: p.description,
        disabled: !p.required
      }));

    // Raw URL oluştur
    let rawUrl = `{{baseUrl}}/${processedPath.join('/')}`;
    if (queryParams.length > 0) {
      const queryString = queryParams
        .filter(q => !q.disabled)
        .map(q => `${q.key}=${q.value}`)
        .join('&');
      if (queryString) {
        rawUrl += `?${queryString}`;
      }
    }

    return {
      raw: rawUrl,
      host: ['{{baseUrl}}'],
      path: processedPath,
      query: queryParams.length > 0 ? queryParams : undefined,
      variable: pathVariables.length > 0 ? pathVariables : undefined
    };
  }

  /**
   * Header'ları oluşturur
   */
  private buildHeaders(endpoint: ApiEndpoint): PostmanHeader[] {
    const headers: PostmanHeader[] = [];

    // Content-Type (body varsa)
    if (endpoint.requestBody) {
      headers.push({
        key: 'Content-Type',
        value: endpoint.requestBody.contentType
      });
    }

    // Accept header
    headers.push({
      key: 'Accept',
      value: 'application/json'
    });

    // Header parametreleri
    const headerParams = endpoint.parameters.filter(p => p.in === 'header');
    for (const param of headerParams) {
      headers.push({
        key: param.name,
        value: param.example ? String(param.example) : '',
        description: param.description
      });
    }

    return headers;
  }

  /**
   * Body oluşturur
   */
  private buildBody(
    requestBody: NonNullable<ApiEndpoint['requestBody']>,
    options: GeneratorOptions
  ): PostmanBody {
    let rawContent: unknown;

    if (requestBody.example) {
      rawContent = requestBody.example;
    } else if (options.includeExamples && requestBody.schema) {
      rawContent = this.generateExampleFromSchema(requestBody.schema);
    } else {
      rawContent = {};
    }

    return {
      mode: 'raw',
      raw: JSON.stringify(rawContent, null, 2),
      options: {
        raw: {
          language: 'json'
        }
      }
    };
  }

  /**
   * Örnek response'ları oluşturur
   */
  private buildExampleResponses(
    endpoint: ApiEndpoint,
    originalRequest: PostmanRequest
  ): PostmanResponse[] {
    return endpoint.responses.map(response => {
      let body: string | undefined;

      if (response.example) {
        body = JSON.stringify(response.example, null, 2);
      } else if (response.schema) {
        body = JSON.stringify(this.generateExampleFromSchema(response.schema), null, 2);
      }

      return {
        name: `${response.statusCode} ${response.description}`,
        originalRequest,
        status: response.description,
        code: response.statusCode,
        body,
        header: response.contentType
          ? [{ key: 'Content-Type', value: response.contentType }]
          : undefined
      };
    });
  }
}

export default PostmanGenerator;
