/**
 * Apigen - Proje Tipi Algılayıcı
 *
 * Bu modül, mevcut çalışma dizinindeki projenin tipini otomatik olarak algılar.
 * Dosya varlığı ve içerik analizine dayalı akıllı tespit yapar.
 *
 * Desteklenen proje tipleri:
 * - OpenAPI/Swagger (swagger.json, openapi.yaml, vb.)
 * - FastAPI (main.py içinde FastAPI import'u)
 * - Flask (app.py içinde Flask import'u)
 * - Spring Boot (pom.xml + @RestController)
 * - ASP.NET Core (.csproj + Controller dosyaları)
 *
 * Algılama algoritması:
 * 1. Önce OpenAPI spec dosyası ara (en güvenilir kaynak)
 * 2. Bulunamazsa, proje dosyalarına bak (package.json, pom.xml, .csproj, requirements.txt)
 * 3. Kaynak kodları tara ve framework-specific pattern'leri bul
 * 4. Bulunan tüm ipuçlarını skorla ve en yüksek skoru döndür
 *
 * @module core/detector
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { ProjectType, DetectionResult } from './types';
import { Logger } from '../utils/logger';

// ============================================================================
// SABITLER VE PATTERN'LER
// ============================================================================

/**
 * OpenAPI spec dosyası pattern'leri
 *
 * Bu dosyalar bulunursa doğrudan OpenAPI tipi döndürülür.
 * Öncelik sırasına göre sıralanmıştır.
 */
const OPENAPI_SPEC_PATTERNS = [
  // Yaygın isimler
  'openapi.json',
  'openapi.yaml',
  'openapi.yml',
  'swagger.json',
  'swagger.yaml',
  'swagger.yml',
  'api-spec.json',
  'api-spec.yaml',
  'api.json',
  'api.yaml',

  // Dizin içinde arama
  'docs/openapi.json',
  'docs/openapi.yaml',
  'docs/swagger.json',
  'docs/swagger.yaml',
  'spec/openapi.json',
  'spec/openapi.yaml',
  'api/openapi.json',
  'api/openapi.yaml'
];

/**
 * Framework algılama skorları
 *
 * Her ipucu için puan değeri. Yüksek puan = yüksek güvenilirlik.
 */
const DETECTION_SCORES = {
  // Proje dosyaları (düşük güvenilirlik - sadece ipucu)
  PROJECT_FILE: 20,

  // Framework-specific dosya (orta güvenilirlik)
  FRAMEWORK_FILE: 40,

  // Import/decorator bulundu (yüksek güvenilirlik)
  CODE_PATTERN: 60,

  // Birden fazla endpoint bulundu (çok yüksek güvenilirlik)
  MULTIPLE_ENDPOINTS: 80,

  // OpenAPI spec dosyası (kesin sonuç)
  OPENAPI_SPEC: 100
};

/**
 * Minimum güvenilirlik skoru
 *
 * Bu skorun altındaki sonuçlar UNKNOWN olarak döndürülür.
 */
const MIN_CONFIDENCE_THRESHOLD = 30;

// ============================================================================
// DETECTOR SINIFI
// ============================================================================

/**
 * Proje Tipi Algılayıcı
 *
 * Verilen dizini analiz ederek proje tipini belirler.
 *
 * @example
 * ```typescript
 * const detector = new ProjectDetector();
 * const result = await detector.detect('/path/to/project');
 *
 * console.log(result.type);       // ProjectType.FASTAPI
 * console.log(result.confidence); // 85
 * console.log(result.reasons);    // ['main.py içinde FastAPI import bulundu', ...]
 * ```
 */
export class ProjectDetector {
  /** Logger instance */
  private readonly logger: Logger;

  /** Tarama derinliği (subdirectory seviyesi) */
  private readonly maxDepth: number;

  /**
   * ProjectDetector constructor
   *
   * @param logger - Logger instance (opsiyonel)
   * @param maxDepth - Maksimum tarama derinliği (varsayılan: 3)
   */
  constructor(logger?: Logger, maxDepth: number = 3) {
    this.logger = logger || new Logger(false);
    this.maxDepth = maxDepth;
  }

  /**
   * Proje tipini algılar
   *
   * Ana algılama metodu. Sırasıyla tüm algılama stratejilerini dener
   * ve en yüksek güvenilirlik skoruna sahip sonucu döndürür.
   *
   * @param projectPath - Analiz edilecek proje dizini (varsayılan: process.cwd())
   * @returns Algılama sonucu
   */
  public async detect(projectPath?: string): Promise<DetectionResult> {
    const targetPath = projectPath || process.cwd();

    this.logger.debug(`Proje tipi algılanıyor: ${targetPath}`);

    // Dizinin var olduğunu kontrol et
    if (!fs.existsSync(targetPath)) {
      return this.createUnknownResult(['Dizin bulunamadı']);
    }

    // Tüm algılama stratejilerini çalıştır
    const results: DetectionResult[] = [];

    // 1. OpenAPI spec dosyası ara (en yüksek öncelik)
    const openapiResult = await this.detectOpenApi(targetPath);
    if (openapiResult) {
      results.push(openapiResult);
    }

    // 2. Python projeleri (FastAPI, Flask)
    const pythonResult = await this.detectPython(targetPath);
    if (pythonResult) {
      results.push(pythonResult);
    }

    // 3. Java projeleri (Spring Boot)
    const javaResult = await this.detectJava(targetPath);
    if (javaResult) {
      results.push(javaResult);
    }

    // 4. .NET projeleri (ASP.NET Core)
    const dotnetResult = await this.detectDotNet(targetPath);
    if (dotnetResult) {
      results.push(dotnetResult);
    }

    // En yüksek güvenilirlik skoruna sahip sonucu seç
    if (results.length === 0) {
      return this.createUnknownResult(['Desteklenen proje tipi bulunamadı']);
    }

    // Skorlara göre sırala
    results.sort((a, b) => b.confidence - a.confidence);

    const bestResult = results[0];

    // Minimum eşiği kontrol et
    if (bestResult.confidence < MIN_CONFIDENCE_THRESHOLD) {
      return this.createUnknownResult([
        'Algılama skoru minimum eşiğin altında',
        `En iyi tahmin: ${bestResult.type} (${bestResult.confidence}%)`
      ]);
    }

    this.logger.debug(`Algılanan tip: ${bestResult.type} (güvenilirlik: ${bestResult.confidence}%)`);
    return bestResult;
  }

  /**
   * OpenAPI/Swagger spec dosyası arar
   *
   * @param projectPath - Proje dizini
   * @returns Algılama sonucu veya null
   */
  private async detectOpenApi(projectPath: string): Promise<DetectionResult | null> {
    this.logger.debug('OpenAPI spec dosyası aranıyor...');

    for (const pattern of OPENAPI_SPEC_PATTERNS) {
      const filePath = path.join(projectPath, pattern);

      if (fs.existsSync(filePath)) {
        // Dosyayı oku ve gerçekten OpenAPI spec olduğunu doğrula
        const isValid = await this.validateOpenApiSpec(filePath);

        if (isValid) {
          this.logger.debug(`OpenAPI spec bulundu: ${pattern}`);

          return {
            type: ProjectType.OPENAPI,
            confidence: DETECTION_SCORES.OPENAPI_SPEC,
            reasons: [`OpenAPI spec dosyası bulundu: ${pattern}`],
            specFile: filePath,
            projectFiles: [filePath]
          };
        }
      }
    }

    // Glob ile daha geniş arama
    const globPatterns = ['**/openapi.{json,yaml,yml}', '**/swagger.{json,yaml,yml}'];

    for (const pattern of globPatterns) {
      const matches = await glob(pattern, {
        cwd: projectPath,
        ignore: ['**/node_modules/**', '**/vendor/**', '**/.git/**'],
        maxDepth: this.maxDepth
      });

      if (matches.length > 0) {
        const specPath = path.join(projectPath, matches[0]);
        const isValid = await this.validateOpenApiSpec(specPath);

        if (isValid) {
          return {
            type: ProjectType.OPENAPI,
            confidence: DETECTION_SCORES.OPENAPI_SPEC,
            reasons: [`OpenAPI spec dosyası bulundu: ${matches[0]}`],
            specFile: specPath,
            projectFiles: [specPath]
          };
        }
      }
    }

    return null;
  }

  /**
   * OpenAPI spec dosyasını doğrular
   *
   * Dosyanın gerçekten OpenAPI/Swagger formatında olduğunu kontrol eder.
   *
   * @param filePath - Spec dosyası yolu
   * @returns Geçerli OpenAPI spec ise true
   */
  private async validateOpenApiSpec(filePath: string): Promise<boolean> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // JSON veya YAML olabilir
      let data: unknown;

      if (filePath.endsWith('.json')) {
        data = JSON.parse(content);
      } else {
        // YAML için basit kontrol (swagger veya openapi keyword'ü)
        return (
          content.includes('swagger:') ||
          content.includes('openapi:') ||
          content.includes('"swagger"') ||
          content.includes('"openapi"')
        );
      }

      // OpenAPI 3.x veya Swagger 2.0 kontrolü
      const spec = data as Record<string, unknown>;
      return (
        typeof spec.openapi === 'string' ||
        typeof spec.swagger === 'string'
      );
    } catch {
      return false;
    }
  }

  /**
   * Python projelerini algılar (FastAPI, Flask)
   *
   * @param projectPath - Proje dizini
   * @returns Algılama sonucu veya null
   */
  private async detectPython(projectPath: string): Promise<DetectionResult | null> {
    this.logger.debug('Python projesi kontrol ediliyor...');

    // Python proje göstergeleri
    const pythonIndicators = [
      'requirements.txt',
      'pyproject.toml',
      'setup.py',
      'Pipfile',
      'poetry.lock'
    ];

    let isPython = false;
    const projectFiles: string[] = [];

    for (const indicator of pythonIndicators) {
      const indicatorPath = path.join(projectPath, indicator);
      if (fs.existsSync(indicatorPath)) {
        isPython = true;
        projectFiles.push(indicatorPath);
      }
    }

    if (!isPython) {
      // .py dosyası var mı kontrol et
      const pyFiles = await glob('**/*.py', {
        cwd: projectPath,
        ignore: ['**/venv/**', '**/.venv/**', '**/env/**', '**/__pycache__/**'],
        maxDepth: this.maxDepth
      });

      if (pyFiles.length === 0) {
        return null;
      }
    }

    // FastAPI, Flask ve Django REST Framework pattern'lerini ara
    const fastapiScore = await this.detectFastApi(projectPath);
    const flaskScore = await this.detectFlask(projectPath);
    const djangoScore = await this.detectDjango(projectPath);

    // En yüksek skora sahip olanı döndür
    const scores = [
      { type: ProjectType.FASTAPI, ...fastapiScore },
      { type: ProjectType.FLASK, ...flaskScore },
      { type: ProjectType.DJANGO_REST, ...djangoScore }
    ].sort((a, b) => b.score - a.score);

    const best = scores[0];

    if (best.score >= MIN_CONFIDENCE_THRESHOLD) {
      return {
        type: best.type,
        confidence: best.score,
        reasons: best.reasons,
        projectFiles: [...projectFiles, ...best.files],
        estimatedEndpoints: best.endpoints
      };
    }

    return null;
  }

  /**
   * FastAPI pattern'lerini arar
   *
   * @param projectPath - Proje dizini
   * @returns Skor ve nedenler
   */
  private async detectFastApi(projectPath: string): Promise<{
    score: number;
    reasons: string[];
    files: string[];
    endpoints: number;
  }> {
    let score = 0;
    const reasons: string[] = [];
    const files: string[] = [];
    let endpointCount = 0;

    // Python dosyalarını bul
    const pyFiles = await glob('**/*.py', {
      cwd: projectPath,
      ignore: ['**/venv/**', '**/.venv/**', '**/env/**', '**/__pycache__/**', '**/test*/**'],
      maxDepth: this.maxDepth
    });

    for (const pyFile of pyFiles) {
      const filePath = path.join(projectPath, pyFile);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // FastAPI import kontrolü
        if (content.includes('from fastapi import') || content.includes('import fastapi')) {
          score += DETECTION_SCORES.CODE_PATTERN;
          reasons.push(`FastAPI import bulundu: ${pyFile}`);
          files.push(filePath);
        }

        // FastAPI instance kontrolü
        if (/FastAPI\s*\(/.test(content)) {
          score += DETECTION_SCORES.FRAMEWORK_FILE;
          reasons.push(`FastAPI instance bulundu: ${pyFile}`);
        }

        // Route decorator'ları say
        const routePatterns = [
          /@app\.(get|post|put|delete|patch)\s*\(/gi,
          /@router\.(get|post|put|delete|patch)\s*\(/gi
        ];

        for (const pattern of routePatterns) {
          const matches = content.match(pattern);
          if (matches) {
            endpointCount += matches.length;
          }
        }

        // APIRouter kontrolü
        if (content.includes('APIRouter(') || content.includes('APIRouter()')) {
          score += DETECTION_SCORES.PROJECT_FILE;
          reasons.push(`APIRouter bulundu: ${pyFile}`);
        }
      } catch {
        // Dosya okunamadı, devam et
      }
    }

    // Endpoint sayısına göre bonus puan
    if (endpointCount > 0) {
      score += Math.min(DETECTION_SCORES.MULTIPLE_ENDPOINTS, endpointCount * 5);
      reasons.push(`${endpointCount} endpoint bulundu`);
    }

    return { score, reasons, files, endpoints: endpointCount };
  }

  /**
   * Flask pattern'lerini arar
   *
   * @param projectPath - Proje dizini
   * @returns Skor ve nedenler
   */
  private async detectFlask(projectPath: string): Promise<{
    score: number;
    reasons: string[];
    files: string[];
    endpoints: number;
  }> {
    let score = 0;
    const reasons: string[] = [];
    const files: string[] = [];
    let endpointCount = 0;

    // Python dosyalarını bul
    const pyFiles = await glob('**/*.py', {
      cwd: projectPath,
      ignore: ['**/venv/**', '**/.venv/**', '**/env/**', '**/__pycache__/**', '**/test*/**'],
      maxDepth: this.maxDepth
    });

    for (const pyFile of pyFiles) {
      const filePath = path.join(projectPath, pyFile);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Flask import kontrolü
        if (content.includes('from flask import') || content.includes('import flask')) {
          score += DETECTION_SCORES.CODE_PATTERN;
          reasons.push(`Flask import bulundu: ${pyFile}`);
          files.push(filePath);
        }

        // Flask instance kontrolü
        if (/Flask\s*\(/.test(content)) {
          score += DETECTION_SCORES.FRAMEWORK_FILE;
          reasons.push(`Flask instance bulundu: ${pyFile}`);
        }

        // Route decorator'ları say
        const routeMatches = content.match(/@app\.route\s*\(/gi);
        if (routeMatches) {
          endpointCount += routeMatches.length;
        }

        // Blueprint kontrolü
        if (content.includes('Blueprint(')) {
          score += DETECTION_SCORES.PROJECT_FILE;
          reasons.push(`Flask Blueprint bulundu: ${pyFile}`);
        }
      } catch {
        // Dosya okunamadı, devam et
      }
    }

    // Endpoint sayısına göre bonus puan
    if (endpointCount > 0) {
      score += Math.min(DETECTION_SCORES.MULTIPLE_ENDPOINTS, endpointCount * 5);
      reasons.push(`${endpointCount} endpoint bulundu`);
    }

    return { score, reasons, files, endpoints: endpointCount };
  }

  /**
   * Django REST Framework pattern'lerini arar
   *
   * @param projectPath - Proje dizini
   * @returns Skor ve nedenler
   */
  private async detectDjango(projectPath: string): Promise<{
    score: number;
    reasons: string[];
    files: string[];
    endpoints: number;
  }> {
    let score = 0;
    const reasons: string[] = [];
    const files: string[] = [];
    let endpointCount = 0;

    // manage.py kontrolü (Django projesi göstergesi)
    const managePath = path.join(projectPath, 'manage.py');
    if (fs.existsSync(managePath)) {
      score += DETECTION_SCORES.PROJECT_FILE;
      reasons.push('Django projesi (manage.py)');
      files.push(managePath);
    }

    // Python dosyalarını bul
    const pyFiles = await glob('**/*.py', {
      cwd: projectPath,
      ignore: ['**/venv/**', '**/.venv/**', '**/env/**', '**/__pycache__/**', '**/migrations/**', '**/test*/**'],
      maxDepth: this.maxDepth
    });

    for (const pyFile of pyFiles) {
      const filePath = path.join(projectPath, pyFile);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Django REST Framework import kontrolü
        if (content.includes('from rest_framework') || content.includes('import rest_framework')) {
          score += DETECTION_SCORES.CODE_PATTERN;
          reasons.push(`Django REST Framework import bulundu: ${pyFile}`);
          files.push(filePath);
        }

        // @api_view decorator kontrolü
        const apiViewMatches = content.match(/@api_view\s*\(/gi);
        if (apiViewMatches) {
          endpointCount += apiViewMatches.length;
        }

        // ViewSet kontrolü
        if (/class\s+\w+\s*\(\s*(?:viewsets\.)?(ModelViewSet|ViewSet|GenericViewSet|ReadOnlyModelViewSet)/i.test(content)) {
          score += DETECTION_SCORES.FRAMEWORK_FILE;
          reasons.push(`ViewSet bulundu: ${pyFile}`);
          endpointCount += 6; // ViewSet varsayılan 6 endpoint
        }

        // APIView kontrolü
        if (/class\s+\w+\s*\(\s*(?:generics\.)?(APIView|GenericAPIView|ListCreateAPIView|RetrieveUpdateDestroyAPIView)/i.test(content)) {
          score += DETECTION_SCORES.CODE_PATTERN;
          reasons.push(`APIView bulundu: ${pyFile}`);
          endpointCount += 1;
        }

        // Router kontrolü
        if (content.includes('DefaultRouter(') || content.includes('SimpleRouter(')) {
          score += DETECTION_SCORES.PROJECT_FILE;
          reasons.push(`DRF Router bulundu: ${pyFile}`);
        }

        // Serializer kontrolü
        if (/class\s+\w+Serializer\s*\(/i.test(content)) {
          score += DETECTION_SCORES.PROJECT_FILE;
          reasons.push(`Serializer bulundu: ${pyFile}`);
        }
      } catch {
        // Dosya okunamadı, devam et
      }
    }

    // Endpoint sayısına göre bonus puan
    if (endpointCount > 0) {
      score += Math.min(DETECTION_SCORES.MULTIPLE_ENDPOINTS, endpointCount * 3);
      reasons.push(`${endpointCount} endpoint bulundu`);
    }

    return { score, reasons, files, endpoints: endpointCount };
  }

  /**
   * Java/Spring Boot projelerini algılar
   *
   * @param projectPath - Proje dizini
   * @returns Algılama sonucu veya null
   */
  private async detectJava(projectPath: string): Promise<DetectionResult | null> {
    this.logger.debug('Java/Spring Boot projesi kontrol ediliyor...');

    // Maven veya Gradle proje dosyası ara
    const pomPath = path.join(projectPath, 'pom.xml');
    const gradlePath = path.join(projectPath, 'build.gradle');
    const gradleKtsPath = path.join(projectPath, 'build.gradle.kts');

    const hasMaven = fs.existsSync(pomPath);
    const hasGradle = fs.existsSync(gradlePath) || fs.existsSync(gradleKtsPath);

    if (!hasMaven && !hasGradle) {
      return null;
    }

    let score = DETECTION_SCORES.PROJECT_FILE;
    const reasons: string[] = [];
    const projectFiles: string[] = [];
    let endpointCount = 0;

    if (hasMaven) {
      projectFiles.push(pomPath);
      reasons.push('Maven projesi (pom.xml)');

      // pom.xml içinde spring-boot dependency ara
      const pomContent = fs.readFileSync(pomPath, 'utf-8');
      if (pomContent.includes('spring-boot')) {
        score += DETECTION_SCORES.FRAMEWORK_FILE;
        reasons.push('Spring Boot dependency bulundu');
      }
    }

    if (hasGradle) {
      const gradleFile = fs.existsSync(gradlePath) ? gradlePath : gradleKtsPath;
      projectFiles.push(gradleFile);
      reasons.push('Gradle projesi');

      const gradleContent = fs.readFileSync(gradleFile, 'utf-8');
      if (gradleContent.includes('spring-boot')) {
        score += DETECTION_SCORES.FRAMEWORK_FILE;
        reasons.push('Spring Boot dependency bulundu');
      }
    }

    // Java Controller dosyalarını ara
    const javaFiles = await glob('**/*.java', {
      cwd: projectPath,
      ignore: ['**/target/**', '**/build/**', '**/test/**'],
      maxDepth: this.maxDepth + 2 // Java projeleri daha derin yapıya sahip
    });

    for (const javaFile of javaFiles) {
      const filePath = path.join(projectPath, javaFile);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // @RestController veya @Controller annotation'ı ara
        if (content.includes('@RestController') || content.includes('@Controller')) {
          score += DETECTION_SCORES.CODE_PATTERN;
          reasons.push(`Controller bulundu: ${javaFile}`);
          projectFiles.push(filePath);

          // Endpoint annotation'larını say
          const endpointPatterns = [
            /@GetMapping/gi,
            /@PostMapping/gi,
            /@PutMapping/gi,
            /@DeleteMapping/gi,
            /@PatchMapping/gi,
            /@RequestMapping/gi
          ];

          for (const pattern of endpointPatterns) {
            const matches = content.match(pattern);
            if (matches) {
              endpointCount += matches.length;
            }
          }
        }
      } catch {
        // Dosya okunamadı, devam et
      }
    }

    // Endpoint sayısına göre bonus puan
    if (endpointCount > 0) {
      score += Math.min(DETECTION_SCORES.MULTIPLE_ENDPOINTS, endpointCount * 3);
      reasons.push(`${endpointCount} endpoint bulundu`);
    }

    if (score < MIN_CONFIDENCE_THRESHOLD) {
      return null;
    }

    return {
      type: ProjectType.SPRING_BOOT,
      confidence: Math.min(score, 100),
      reasons,
      projectFiles,
      estimatedEndpoints: endpointCount
    };
  }

  /**
   * .NET/ASP.NET Core projelerini algılar
   *
   * @param projectPath - Proje dizini
   * @returns Algılama sonucu veya null
   */
  private async detectDotNet(projectPath: string): Promise<DetectionResult | null> {
    this.logger.debug('.NET/ASP.NET Core projesi kontrol ediliyor...');

    // .csproj dosyası ara
    const csprojFiles = await glob('**/*.csproj', {
      cwd: projectPath,
      ignore: ['**/bin/**', '**/obj/**'],
      maxDepth: this.maxDepth
    });

    if (csprojFiles.length === 0) {
      return null;
    }

    let score = DETECTION_SCORES.PROJECT_FILE;
    const reasons: string[] = [];
    const projectFiles: string[] = [];
    let endpointCount = 0;

    // .csproj dosyalarını kontrol et
    for (const csprojFile of csprojFiles) {
      const csprojPath = path.join(projectPath, csprojFile);
      projectFiles.push(csprojPath);
      reasons.push(`.NET projesi: ${csprojFile}`);

      try {
        const content = fs.readFileSync(csprojPath, 'utf-8');

        // ASP.NET Core SDK kontrolü
        if (
          content.includes('Microsoft.NET.Sdk.Web') ||
          content.includes('Microsoft.AspNetCore')
        ) {
          score += DETECTION_SCORES.FRAMEWORK_FILE;
          reasons.push('ASP.NET Core Web projesi');
        }
      } catch {
        // Dosya okunamadı
      }
    }

    // Controller dosyalarını ara
    const csFiles = await glob('**/*.cs', {
      cwd: projectPath,
      ignore: ['**/bin/**', '**/obj/**', '**/Migrations/**'],
      maxDepth: this.maxDepth + 2
    });

    for (const csFile of csFiles) {
      const filePath = path.join(projectPath, csFile);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Controller sınıfı ara
        if (
          content.includes('[ApiController]') ||
          content.includes(': ControllerBase') ||
          content.includes(': Controller')
        ) {
          score += DETECTION_SCORES.CODE_PATTERN;
          reasons.push(`Controller bulundu: ${csFile}`);
          projectFiles.push(filePath);

          // HTTP attribute'larını say
          const endpointPatterns = [
            /\[HttpGet/gi,
            /\[HttpPost/gi,
            /\[HttpPut/gi,
            /\[HttpDelete/gi,
            /\[HttpPatch/gi
          ];

          for (const pattern of endpointPatterns) {
            const matches = content.match(pattern);
            if (matches) {
              endpointCount += matches.length;
            }
          }
        }
      } catch {
        // Dosya okunamadı
      }
    }

    // Endpoint sayısına göre bonus puan
    if (endpointCount > 0) {
      score += Math.min(DETECTION_SCORES.MULTIPLE_ENDPOINTS, endpointCount * 3);
      reasons.push(`${endpointCount} endpoint bulundu`);
    }

    if (score < MIN_CONFIDENCE_THRESHOLD) {
      return null;
    }

    return {
      type: ProjectType.ASPNET_CORE,
      confidence: Math.min(score, 100),
      reasons,
      projectFiles,
      estimatedEndpoints: endpointCount
    };
  }

  /**
   * Bilinmeyen tip sonucu oluşturur
   *
   * @param reasons - Bilinmeme nedenleri
   * @returns DetectionResult
   */
  private createUnknownResult(reasons: string[]): DetectionResult {
    return {
      type: ProjectType.UNKNOWN,
      confidence: 0,
      reasons,
      projectFiles: []
    };
  }
}

// Default export
export default ProjectDetector;
