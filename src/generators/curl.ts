/**
 * Apigen - cURL Generator
 *
 * Bu modül, ApiProject'i cURL komutlarına dönüştürür.
 * Her endpoint için ayrı bir .sh dosyası ve tümünü içeren bir all-requests.sh oluşturur.
 *
 * Özellikler:
 * - Her endpoint için ayrı .sh dosyası
 * - Executable permission (chmod +x)
 * - Shell escaping (özellikle JSON body için)
 * - Variable substitution desteği ($BASE_URL, $TOKEN)
 * - Tüm komutları içeren all-requests.sh
 * - Verbose (-v) ve silent (-s) mod seçenekleri
 *
 * @module generators/curl
 */

import * as path from 'path';
import {
  BaseGenerator,
  ApiProject,
  ApiGroup,
  ApiEndpoint,
  ApiParameter,
  GeneratorOptions,
  GeneratorResult,
  HttpMethod
} from './base';
import { AuthType } from '../core/types';
import { ensureDir, writeFile } from '../utils/file-io';
import { slugify } from '../utils/helpers';

// ============================================================================
// CURL GENERATOR
// ============================================================================

/**
 * cURL Script Generator
 *
 * ApiProject'i cURL shell scriptlerine dönüştürür.
 *
 * @example
 * ```typescript
 * const generator = new CurlGenerator();
 * const result = await generator.generate(project, {
 *   outputDir: './output',
 *   overwrite: true,
 *   prettyPrint: true,
 *   includeExamples: true
 * });
 * ```
 */
export class CurlGenerator extends BaseGenerator {
  protected readonly name = 'CurlGenerator';
  protected readonly defaultFileName = 'all-requests';
  protected readonly fileExtension = '.sh';

  /**
   * cURL scriptleri üretir
   */
  public async generate(
    project: ApiProject,
    options: GeneratorOptions
  ): Promise<GeneratorResult> {
    this.info('cURL scriptleri üretiliyor...');

    try {
      const curlDir = path.join(options.outputDir, 'curl');
      await ensureDir(curlDir);

      const generatedFiles: string[] = [];
      const allCommands: string[] = [];

      // Her grup için
      for (const group of project.groups) {
        // Grup dizini oluştur
        const groupDir = path.join(curlDir, slugify(group.name));
        await ensureDir(groupDir);

        // Her endpoint için ayrı dosya
        for (const endpoint of group.endpoints) {
          const { script, command } = this.buildCurlScript(endpoint, project, options);

          // Dosya adı oluştur
          const fileName = this.generateFileName(endpoint);
          const filePath = path.join(groupDir, fileName);

          // Dosyaya yaz
          const success = await this.saveToFile(filePath, script);
          if (success) {
            generatedFiles.push(filePath);
            allCommands.push(command);
          }
        }
      }

      // all-requests.sh oluştur
      const allScript = this.buildAllRequestsScript(project, allCommands);
      const allPath = path.join(curlDir, 'all-requests.sh');
      const allSuccess = await this.saveToFile(allPath, allScript);
      if (allSuccess) {
        generatedFiles.push(allPath);
      }

      // README.md oluştur (kullanım talimatları)
      const readmePath = path.join(curlDir, 'README.md');
      const readmeContent = this.buildReadme(project);
      await this.saveToFile(readmePath, readmeContent);
      generatedFiles.push(readmePath);

      this.debug(`${generatedFiles.length} dosya oluşturuldu`);

      return this.createSuccessResult(generatedFiles);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error(`Generation hatası: ${errorMessage}`);

      return this.createErrorResult([`cURL generation hatası: ${errorMessage}`]);
    }
  }

  /**
   * Tek endpoint için cURL scripti oluşturur
   */
  private buildCurlScript(
    endpoint: ApiEndpoint,
    project: ApiProject,
    options: GeneratorOptions
  ): { script: string; command: string } {
    const lines: string[] = [];

    // Shebang
    lines.push('#!/bin/bash');
    lines.push('');

    // Açıklama
    lines.push(`# ${endpoint.summary || endpoint.path}`);
    if (endpoint.description) {
      lines.push(`# ${endpoint.description}`);
    }
    lines.push(`# Method: ${endpoint.method}`);
    lines.push(`# Path: ${endpoint.path}`);
    lines.push('');

    // Environment variable'lar
    lines.push('# Environment variables (override edilebilir)');
    lines.push(`BASE_URL="\${BASE_URL:-${project.config.baseUrl}}"`);

    if (project.auth) {
      if (project.auth.type === AuthType.BEARER) {
        lines.push('TOKEN="${TOKEN:-your-token-here}"');
      } else if (project.auth.type === AuthType.API_KEY) {
        lines.push('API_KEY="${API_KEY:-your-api-key-here}"');
      }
    }
    lines.push('');

    // cURL komutu
    const command = this.buildCurlCommand(endpoint, project, options);
    lines.push(command);
    lines.push('');

    return {
      script: lines.join('\n'),
      command
    };
  }

  /**
   * cURL komutunu oluşturur
   */
  private buildCurlCommand(
    endpoint: ApiEndpoint,
    project: ApiProject,
    options: GeneratorOptions
  ): string {
    const parts: string[] = ['curl'];

    // Verbose mod (opsiyonel)
    // parts.push('-v');

    // Silent mode with show errors
    parts.push('-sS');

    // Method
    parts.push(`-X ${endpoint.method}`);

    // URL
    const url = this.buildEndpointUrl(endpoint);
    parts.push(`"${url}"`);

    // Headers
    const headers = this.buildHeaders(endpoint, project);
    for (const header of headers) {
      parts.push(`-H "${header}"`);
    }

    // Body
    if (endpoint.requestBody && this.methodRequiresBody(endpoint.method)) {
      const body = this.buildBody(endpoint, options);
      if (body) {
        parts.push(`-d '${body}'`);
      }
    }

    // Pretty print output (jq varsa)
    parts.push('| jq . 2>/dev/null || cat');

    return parts.join(' \\\n  ');
  }

  /**
   * Endpoint için URL oluşturur (shell variable formatında)
   */
  private buildEndpointUrl(endpoint: ApiEndpoint): string {
    // Path parametrelerini değişkenle değiştir
    let url = endpoint.path;
    const pathParams = endpoint.parameters.filter(p => p.in === 'path');

    for (const param of pathParams) {
      // ${PARAM_NAME} formatında shell variable kullan
      const varName = param.name.toUpperCase().replace(/-/g, '_');
      url = url.replace(`{${param.name}}`, `\${${varName}:-${param.example || param.name}}`);
    }

    // Query parametreleri
    const queryParams = endpoint.parameters.filter(p => p.in === 'query');
    if (queryParams.length > 0) {
      const queryString = queryParams
        .map(p => {
          const value = p.example ? String(p.example) : '';
          return `${p.name}=${encodeURIComponent(value)}`;
        })
        .join('&');
      url += `?${queryString}`;
    }

    return `\${BASE_URL}${url}`;
  }

  /**
   * Header'ları oluşturur
   */
  private buildHeaders(endpoint: ApiEndpoint, project: ApiProject): string[] {
    const headers: string[] = [];

    // Content-Type
    if (endpoint.requestBody) {
      headers.push(`Content-Type: ${endpoint.requestBody.contentType}`);
    }

    // Accept
    headers.push('Accept: application/json');

    // Auth header
    if (project.auth) {
      switch (project.auth.type) {
        case AuthType.BEARER:
          headers.push('Authorization: Bearer ${TOKEN}');
          break;
        case AuthType.API_KEY:
          if (project.auth.keyLocation === 'header') {
            headers.push(`${project.auth.keyName || 'X-API-Key'}: \${API_KEY}`);
          }
          break;
        case AuthType.BASIC:
          headers.push('Authorization: Basic ${BASIC_AUTH}');
          break;
      }
    }

    // Custom header parametreleri
    const headerParams = endpoint.parameters.filter(p => p.in === 'header');
    for (const param of headerParams) {
      const value = param.example ? String(param.example) : '';
      headers.push(`${param.name}: ${value}`);
    }

    return headers;
  }

  /**
   * Body oluşturur
   */
  private buildBody(endpoint: ApiEndpoint, options: GeneratorOptions): string | null {
    if (!endpoint.requestBody) return null;

    let bodyData: unknown;

    if (endpoint.requestBody.example) {
      bodyData = endpoint.requestBody.example;
    } else if (options.includeExamples && endpoint.requestBody.schema) {
      bodyData = this.generateExampleFromSchema(endpoint.requestBody.schema);
    } else {
      return null;
    }

    // JSON'u shell-safe hale getir (tek tırnak içinde olacak)
    const jsonStr = JSON.stringify(bodyData);
    // Tek tırnakları escape et
    return jsonStr.replace(/'/g, "'\"'\"'");
  }

  /**
   * Dosya adı oluşturur
   */
  private generateFileName(endpoint: ApiEndpoint): string {
    const method = endpoint.method.toLowerCase();
    const pathPart = slugify(endpoint.path.replace(/\{[^}]+\}/g, 'id'));

    return `${method}-${pathPart}.sh`;
  }

  /**
   * Tüm komutları içeren script oluşturur
   */
  private buildAllRequestsScript(project: ApiProject, commands: string[]): string {
    const lines: string[] = [];

    // Shebang ve açıklama
    lines.push('#!/bin/bash');
    lines.push('');
    lines.push(`# ${project.info.title} - Tüm API İstekleri`);
    lines.push(`# Version: ${project.info.version}`);
    lines.push('# Bu dosya tüm API endpoint\'lerini test etmek için kullanılabilir.');
    lines.push('');

    // Environment variable'lar
    lines.push('# ============================================');
    lines.push('# YAPILANDIRMA');
    lines.push('# ============================================');
    lines.push('');
    lines.push(`export BASE_URL="\${BASE_URL:-${project.config.baseUrl}}"`);

    if (project.auth) {
      if (project.auth.type === AuthType.BEARER) {
        lines.push('export TOKEN="${TOKEN:-your-token-here}"');
      } else if (project.auth.type === AuthType.API_KEY) {
        lines.push('export API_KEY="${API_KEY:-your-api-key-here}"');
      }
    }
    lines.push('');

    // Yardımcı fonksiyon
    lines.push('# ============================================');
    lines.push('# YARDIMCI FONKSİYONLAR');
    lines.push('# ============================================');
    lines.push('');
    lines.push('print_header() {');
    lines.push('  echo ""');
    lines.push('  echo "============================================"');
    lines.push('  echo "$1"');
    lines.push('  echo "============================================"');
    lines.push('}');
    lines.push('');

    // Her grup için
    lines.push('# ============================================');
    lines.push('# API İSTEKLERİ');
    lines.push('# ============================================');
    lines.push('');

    for (const group of project.groups) {
      lines.push(`print_header "${group.name}"`);
      lines.push('');

      for (const endpoint of group.endpoints) {
        lines.push(`echo ">>> ${endpoint.method} ${endpoint.path}"`);

        // Basit komut (referans için)
        const simpleUrl = `\${BASE_URL}${endpoint.path}`;
        lines.push(`curl -sS -X ${endpoint.method} "${simpleUrl}" \\`);
        lines.push('  -H "Accept: application/json" \\');

        if (project.auth?.type === AuthType.BEARER) {
          lines.push('  -H "Authorization: Bearer ${TOKEN}" \\');
        }

        if (endpoint.requestBody) {
          lines.push(`  -H "Content-Type: ${endpoint.requestBody.contentType}" \\`);
          lines.push('  -d \'{}\'');
        }

        lines.push('');
        lines.push('echo ""');
        lines.push('');
      }
    }

    lines.push('echo "Tüm istekler tamamlandı."');

    return lines.join('\n');
  }

  /**
   * README.md oluşturur
   */
  private buildReadme(project: ApiProject): string {
    const lines: string[] = [];

    lines.push(`# ${project.info.title} - cURL Scripts`);
    lines.push('');
    lines.push('Bu dizin, API endpoint\'lerini test etmek için cURL scriptleri içerir.');
    lines.push('');

    lines.push('## Kullanım');
    lines.push('');
    lines.push('### Tek Endpoint');
    lines.push('```bash');
    lines.push('# Environment variable\'ları ayarla');
    lines.push(`export BASE_URL="${project.config.baseUrl}"`);

    if (project.auth?.type === AuthType.BEARER) {
      lines.push('export TOKEN="your-jwt-token"');
    } else if (project.auth?.type === AuthType.API_KEY) {
      lines.push('export API_KEY="your-api-key"');
    }

    lines.push('');
    lines.push('# Scripti çalıştır');
    lines.push('chmod +x ./default/get-users.sh');
    lines.push('./default/get-users.sh');
    lines.push('```');
    lines.push('');

    lines.push('### Tüm Endpoint\'ler');
    lines.push('```bash');
    lines.push('chmod +x ./all-requests.sh');
    lines.push('./all-requests.sh');
    lines.push('```');
    lines.push('');

    lines.push('## Dizin Yapısı');
    lines.push('');
    lines.push('```');
    lines.push('curl/');
    lines.push('├── all-requests.sh    # Tüm endpoint\'leri çalıştırır');
    lines.push('├── README.md          # Bu dosya');

    for (const group of project.groups) {
      const groupSlug = slugify(group.name);
      lines.push(`├── ${groupSlug}/`);

      for (const endpoint of group.endpoints) {
        const fileName = this.generateFileName(endpoint);
        lines.push(`│   └── ${fileName}`);
      }
    }

    lines.push('```');
    lines.push('');

    lines.push('## Environment Variables');
    lines.push('');
    lines.push('| Variable | Açıklama | Varsayılan |');
    lines.push('|----------|----------|------------|');
    lines.push(`| BASE_URL | API base URL | ${project.config.baseUrl} |`);

    if (project.auth?.type === AuthType.BEARER) {
      lines.push('| TOKEN | JWT Bearer token | - |');
    } else if (project.auth?.type === AuthType.API_KEY) {
      lines.push('| API_KEY | API anahtarı | - |');
    }

    lines.push('');
    lines.push('## Notlar');
    lines.push('');
    lines.push('- Scriptler `jq` yüklüyse JSON çıktıyı formatlar');
    lines.push('- Path parametreleri için shell variable\'lar kullanılır');
    lines.push('- Örnek: `export USER_ID=123 && ./get-user-by-id.sh`');

    return lines.join('\n');
  }
}

export default CurlGenerator;
