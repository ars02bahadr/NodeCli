/**
 * Apigen - README Generator
 *
 * Bu modül, ApiProject'i Markdown dokümantasyonuna dönüştürür.
 * Handlebars template motoru kullanılarak özelleştirilebilir çıktı üretir.
 *
 * Özellikler:
 * - Handlebars şablon desteği
 * - Endpoint listesi (gruplu)
 * - Quick start guide
 * - Auth bilgileri
 * - Örnek request/response
 * - Markdown tablo formatı
 *
 * @module generators/readme
 */

import * as path from 'path';
import * as fs from 'fs';
import Handlebars from 'handlebars';
import {
  BaseGenerator,
  ApiProject,
  ApiGroup,
  ApiEndpoint,
  ApiParameter,
  GeneratorOptions,
  GeneratorResult,
  HttpMethod,
  SchemaType
} from './base';
import { AuthType } from '../core/types';

// ============================================================================
// HANDLEBARS HELPERS
// ============================================================================

// JSON stringify helper
Handlebars.registerHelper('json', function (context: unknown) {
  return JSON.stringify(context, null, 2);
});

// Uppercase helper
Handlebars.registerHelper('upper', function (str: string) {
  return str?.toUpperCase() || '';
});

// Lowercase helper
Handlebars.registerHelper('lower', function (str: string) {
  return str?.toLowerCase() || '';
});

// Conditional equals
Handlebars.registerHelper('eq', function (a: unknown, b: unknown) {
  return a === b;
});

// Method badge color
Handlebars.registerHelper('methodColor', function (method: string) {
  const colors: Record<string, string> = {
    GET: '🟢',
    POST: '🟡',
    PUT: '🟠',
    DELETE: '🔴',
    PATCH: '🟣'
  };
  return colors[method?.toUpperCase()] || '⚪';
});

// First element helper - dizinin ilk elemanını döndürür
Handlebars.registerHelper('first', function (array: unknown[]) {
  if (Array.isArray(array) && array.length > 0) {
    return array[0];
  }
  return null;
});

// ifEquals block helper - eşitlik kontrolü için
Handlebars.registerHelper('ifEquals', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  if (a === b) {
    return options.fn(this);
  }
  return options.inverse(this);
});

// JSON pretty print helper
Handlebars.registerHelper('jsonPretty', function (context: unknown) {
  if (context === undefined || context === null) {
    return '{}';
  }
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return '{}';
  }
});

// ============================================================================
// VARSAYILAN ŞABLON
// ============================================================================

const DEFAULT_TEMPLATE = `# {{info.title}}

{{#if info.description}}
{{info.description}}
{{/if}}

**Version:** {{info.version}}

## Base URL

\`\`\`
{{config.baseUrl}}
\`\`\`

{{#if auth}}
## Authentication

{{#eq auth.type "bearer"}}
Bu API **Bearer Token** kimlik doğrulaması kullanır.

\`\`\`
Authorization: Bearer <your-token>
\`\`\`
{{/eq}}

{{#eq auth.type "apiKey"}}
Bu API **API Key** kimlik doğrulaması kullanır.

{{#eq auth.keyLocation "header"}}
\`\`\`
{{auth.keyName}}: <your-api-key>
\`\`\`
{{/eq}}
{{#eq auth.keyLocation "query"}}
\`\`\`
?{{auth.keyName}}=<your-api-key>
\`\`\`
{{/eq}}
{{/eq}}

{{#eq auth.type "basic"}}
Bu API **Basic Auth** kimlik doğrulaması kullanır.

\`\`\`
Authorization: Basic <base64(username:password)>
\`\`\`
{{/eq}}
{{/if}}

## Quick Start

### cURL ile

\`\`\`bash
curl -X GET "{{config.baseUrl}}/health" \\
  -H "Accept: application/json"
\`\`\`

### JavaScript ile

\`\`\`javascript
const response = await fetch('{{config.baseUrl}}/health', {
  headers: {
    'Accept': 'application/json'{{#if auth}},
    'Authorization': 'Bearer YOUR_TOKEN'{{/if}}
  }
});

const data = await response.json();
console.log(data);
\`\`\`

---

## Endpoints

{{#each groups}}
### {{name}}

{{#if description}}
{{description}}
{{/if}}

| Method | Path | Summary |
|--------|------|---------|
{{#each endpoints}}
| {{methodColor method}} **{{method}}** | \`{{path}}\` | {{summary}} |
{{/each}}

{{#each endpoints}}
---

#### {{methodColor method}} {{method}} {{path}}

{{#if summary}}
**{{summary}}**
{{/if}}

{{#if description}}
{{description}}
{{/if}}

{{#if deprecated}}
> ⚠️ **Deprecated:** Bu endpoint kullanımdan kaldırılmıştır.
{{/if}}

{{#if parameters.length}}
**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
{{#each parameters}}
| \`{{name}}\` | {{in}} | {{schema.type}} | {{#if required}}✅{{else}}❌{{/if}} | {{description}} |
{{/each}}
{{/if}}

{{#if requestBody}}
**Request Body:**

Content-Type: \`{{requestBody.contentType}}\`

{{#if requestBody.description}}
{{requestBody.description}}
{{/if}}

\`\`\`json
{{json requestBody.example}}
\`\`\`
{{/if}}

**Responses:**

{{#each responses}}
- **{{statusCode}}** - {{description}}
{{#if example}}
\`\`\`json
{{json example}}
\`\`\`
{{/if}}
{{/each}}

{{/each}}
{{/each}}

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - İstek formatı hatalı |
| 401 | Unauthorized - Kimlik doğrulama gerekli |
| 403 | Forbidden - Erişim izni yok |
| 404 | Not Found - Kaynak bulunamadı |
| 422 | Validation Error - Doğrulama hatası |
| 500 | Internal Server Error - Sunucu hatası |

---

*Bu dokümantasyon [Apigen](https://github.com/apigen/apigen) tarafından otomatik oluşturulmuştur.*
`;

// ============================================================================
// README GENERATOR
// ============================================================================

/**
 * README/Markdown Generator
 *
 * ApiProject'i Markdown dokümantasyonuna dönüştürür.
 *
 * @example
 * ```typescript
 * const generator = new ReadmeGenerator();
 * const result = await generator.generate(project, {
 *   outputDir: './output',
 *   overwrite: true,
 *   prettyPrint: true,
 *   includeExamples: true
 * });
 * ```
 */
export class ReadmeGenerator extends BaseGenerator {
  protected readonly name = 'ReadmeGenerator';
  protected readonly defaultFileName = 'API_README';
  protected readonly fileExtension = '.md';

  /** Compiled Handlebars template */
  private template: HandlebarsTemplateDelegate | null = null;

  /**
   * README üretir
   */
  public async generate(
    project: ApiProject,
    options: GeneratorOptions
  ): Promise<GeneratorResult> {
    this.info('README üretiliyor...');

    try {
      // Template'i yükle
      const templateContent = this.loadTemplate(options.outputDir);

      // Template'i compile et
      this.template = Handlebars.compile(templateContent);

      // Veriyi hazırla
      const data = this.prepareTemplateData(project, options);

      // Render et
      const markdown = this.template(data);

      // Dosyaya kaydet
      const outputPath = this.getOutputPath(options);
      const success = await this.saveToFile(outputPath, markdown);

      if (!success) {
        return this.createErrorResult(['Dosya yazılamadı: ' + outputPath]);
      }

      this.debug(`README oluşturuldu: ${outputPath}`);

      return this.createSuccessResult([outputPath]);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error(`Generation hatası: ${errorMessage}`);

      return this.createErrorResult([`README generation hatası: ${errorMessage}`]);
    }
  }

  /**
   * Template dosyasını yükler
   *
   * Önce templates/ dizininde arar, bulamazsa varsayılan şablonu kullanır.
   */
  private loadTemplate(outputDir: string): string {
    // Custom template var mı kontrol et
    const possiblePaths = [
      path.join(process.cwd(), 'templates', 'readme.hbs'),
      path.join(outputDir, '..', 'templates', 'readme.hbs'),
      path.join(__dirname, '..', '..', 'templates', 'readme.hbs')
    ];

    for (const templatePath of possiblePaths) {
      if (fs.existsSync(templatePath)) {
        this.debug(`Custom template bulundu: ${templatePath}`);
        return fs.readFileSync(templatePath, 'utf-8');
      }
    }

    // Varsayılan şablonu kullan
    this.debug('Varsayılan template kullanılıyor');
    return DEFAULT_TEMPLATE;
  }

  /**
   * Template için veriyi hazırlar
   */
  private prepareTemplateData(
    project: ApiProject,
    options: GeneratorOptions
  ): Record<string, unknown> {
    // Endpoint'lere örnek veri ekle
    const groups = project.groups.map(group => ({
      ...group,
      endpoints: group.endpoints.map(endpoint => {
        const prepared: Record<string, unknown> = { ...endpoint };

        // Request body örneği
        if (endpoint.requestBody && options.includeExamples) {
          if (!endpoint.requestBody.example && endpoint.requestBody.schema) {
            prepared.requestBody = {
              ...endpoint.requestBody,
              example: this.generateExampleFromSchema(endpoint.requestBody.schema)
            };
          }
        }

        // Response örnekleri
        if (options.includeExamples) {
          prepared.responses = endpoint.responses.map(resp => {
            if (!resp.example && resp.schema) {
              return {
                ...resp,
                example: this.generateExampleFromSchema(resp.schema)
              };
            }
            return resp;
          });
        }

        return prepared;
      })
    }));

    return {
      info: project.info,
      config: project.config,
      auth: project.auth,
      groups,
      projectType: project.projectType,
      generatedAt: new Date().toISOString()
    };
  }
}

export default ReadmeGenerator;
