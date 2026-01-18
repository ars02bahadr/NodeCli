/**
 * Apigen - Spring Boot Extractor
 *
 * Bu modül, Java Spring Boot projelerini statik olarak analiz eder.
 * Regex tabanlı "best-effort" analiz yapar.
 *
 * Taranan pattern'ler:
 * - @RestController, @Controller
 * - @RequestMapping (class ve method seviyesi)
 * - @GetMapping, @PostMapping, @PutMapping, @DeleteMapping, @PatchMapping
 * - @PathVariable, @RequestParam, @RequestBody
 * - DTO sınıfları ve record'lar
 *
 * Sınırlamalar:
 * - Annotation'lar compile-time'da işlendiği için
 *   runtime değerleri (property injection vb.) algılanmaz
 * - Spring Expression Language (SpEL) desteklenmez
 * - Karmaşık generic tipler tam olarak parse edilmez
 *
 * @module extractors/java/spring
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import {
  BaseExtractor,
  ApiProject,
  ApiGroup,
  ApiEndpoint,
  ApiParameter,
  ApiRequestBody,
  ApiSchema,
  ApigenConfig,
  ExtractorResult,
  ProjectType,
  HttpMethod,
  ParameterLocation,
  SchemaType
} from '../base';

// ============================================================================
// REGEX PATTERN'LERİ
// ============================================================================

/**
 * Controller class pattern'i
 *
 * Yakalar:
 * - @RestController
 * - @Controller
 * - @RestController @RequestMapping("/api")
 */
const CONTROLLER_CLASS_REGEX = /@(?:Rest)?Controller[\s\S]*?(?:@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']\s*\))?\s*public\s+class\s+(\w+)/gi;

/**
 * Class seviyesi @RequestMapping pattern'i
 */
const CLASS_REQUEST_MAPPING_REGEX = /@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/i;

/**
 * HTTP metod mapping pattern'leri
 */
const MAPPING_PATTERNS: Record<string, RegExp> = {
  GET: /@GetMapping\s*\(\s*(?:value\s*=\s*)?["']?([^"'\s)]+)?["']?\s*\)/gi,
  POST: /@PostMapping\s*\(\s*(?:value\s*=\s*)?["']?([^"'\s)]+)?["']?\s*\)/gi,
  PUT: /@PutMapping\s*\(\s*(?:value\s*=\s*)?["']?([^"'\s)]+)?["']?\s*\)/gi,
  DELETE: /@DeleteMapping\s*\(\s*(?:value\s*=\s*)?["']?([^"'\s)]+)?["']?\s*\)/gi,
  PATCH: /@PatchMapping\s*\(\s*(?:value\s*=\s*)?["']?([^"'\s)]+)?["']?\s*\)/gi
};

/**
 * @RequestMapping ile method belirtilen pattern
 */
const REQUEST_MAPPING_METHOD_REGEX = /@RequestMapping\s*\([^)]*method\s*=\s*RequestMethod\.(\w+)[^)]*(?:value\s*=\s*)?["']?([^"'\s,)]+)?/gi;

/**
 * Java metod tanımı pattern'i
 */
const METHOD_DEF_REGEX = /(?:public|private|protected)?\s*(?:[\w<>,\s]+)\s+(\w+)\s*\(([^)]*)\)/;

/**
 * @PathVariable pattern'i
 */
const PATH_VARIABLE_REGEX = /@PathVariable(?:\s*\(\s*(?:value\s*=\s*)?["']?(\w+)["']?\s*\))?\s*(\w+)\s+(\w+)/g;

/**
 * @RequestParam pattern'i
 */
const REQUEST_PARAM_REGEX = /@RequestParam(?:\s*\([^)]*\))?\s*(\w+)\s+(\w+)/g;

/**
 * @RequestBody pattern'i
 */
const REQUEST_BODY_REGEX = /@RequestBody\s*(\w+)\s+(\w+)/;

/**
 * Java DTO/Record class pattern'i
 */
const DTO_CLASS_REGEX = /(?:public\s+)?(?:class|record)\s+(\w+(?:Dto|DTO|Request|Response|Entity)?)\s*(?:\([^)]*\)|(?:extends|implements)[^{]*)?{([^}]*)}/gi;

/**
 * Java field pattern'i
 */
const JAVA_FIELD_REGEX = /(?:private|public|protected)?\s*(\w+(?:<[^>]+>)?)\s+(\w+)\s*[;=]/g;

// ============================================================================
// TİP DÖNÜŞÜMÜ
// ============================================================================

const JAVA_TYPE_MAP: Record<string, SchemaType> = {
  'String': SchemaType.STRING,
  'Integer': SchemaType.INTEGER,
  'int': SchemaType.INTEGER,
  'Long': SchemaType.INTEGER,
  'long': SchemaType.INTEGER,
  'Double': SchemaType.NUMBER,
  'double': SchemaType.NUMBER,
  'Float': SchemaType.NUMBER,
  'float': SchemaType.NUMBER,
  'Boolean': SchemaType.BOOLEAN,
  'boolean': SchemaType.BOOLEAN,
  'List': SchemaType.ARRAY,
  'ArrayList': SchemaType.ARRAY,
  'Set': SchemaType.ARRAY,
  'Map': SchemaType.OBJECT,
  'HashMap': SchemaType.OBJECT,
  'Object': SchemaType.OBJECT
};

// ============================================================================
// YARDIMCI TİPLER
// ============================================================================

interface ExtractedRoute {
  method: HttpMethod;
  path: string;
  methodName: string;
  className: string;
  methodParams: string;
  filePath: string;
}

interface ExtractedDto {
  name: string;
  fields: Array<{ name: string; type: string }>;
  filePath: string;
}

// ============================================================================
// SPRING BOOT EXTRACTOR
// ============================================================================

/**
 * Spring Boot Extractor
 *
 * Java Spring Boot projelerini regex ile analiz eder.
 */
export class SpringBootExtractor extends BaseExtractor {
  protected readonly projectType = ProjectType.SPRING_BOOT;
  protected readonly name = 'SpringBootExtractor';

  /** Bulunan DTO'lar */
  private dtos: Map<string, ExtractedDto> = new Map();

  /**
   * Spring Boot projesini analiz eder
   */
  public async extract(source: string, config: ApigenConfig): Promise<ExtractorResult> {
    this.info(`Spring Boot projesi taranıyor: ${source}`);

    this.dtos.clear();
    const warnings: string[] = [];

    try {
      // 1. Java dosyalarını bul
      const javaFiles = await this.findJavaFiles(source);

      if (javaFiles.length === 0) {
        return this.createErrorResult(['Java dosyası bulunamadı']);
      }

      this.debug(`${javaFiles.length} Java dosyası bulundu`);

      // 2. DTO'ları çıkar (önce, çünkü endpoint'lerde kullanılacak)
      for (const javaFile of javaFiles) {
        const filePath = path.join(source, javaFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        this.extractDtos(content, filePath);
      }

      // 3. Controller'ları tara
      const allRoutes: ExtractedRoute[] = [];

      for (const javaFile of javaFiles) {
        const filePath = path.join(source, javaFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        const routes = this.extractRoutes(content, filePath);
        allRoutes.push(...routes);
      }

      if (allRoutes.length === 0) {
        return this.createErrorResult([
          'Spring Boot endpoint bulunamadı',
          'İpucu: @RestController ve @GetMapping, @PostMapping gibi annotation\'lar aranıyor'
        ]);
      }

      // 4. Proje oluştur
      const project = this.createEmptyProject(source, config);
      project.info.title = this.extractProjectName(source);

      // 5. Route'ları endpoint'lere dönüştür
      const endpoints = allRoutes.map(route => this.routeToEndpoint(route));

      // 6. Controller bazlı gruplama
      project.groups = this.groupEndpointsByController(endpoints, allRoutes);

      this.info(`${endpoints.length} endpoint başarıyla çıkarıldı`);

      warnings.push('Spring Boot extractor experimental\'dir. Tüm endpoint\'ler algılanmamış olabilir.');

      return this.createSuccessResult(project, javaFiles.length, warnings);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error(`Parse hatası: ${errorMessage}`);

      return this.createErrorResult([`Spring Boot parse hatası: ${errorMessage}`]);
    }
  }

  /**
   * Java dosyalarını bulur
   */
  private async findJavaFiles(projectPath: string): Promise<string[]> {
    const files = await glob('**/*.java', {
      cwd: projectPath,
      ignore: [
        '**/target/**',
        '**/build/**',
        '**/test/**',
        '**/tests/**',
        '**/*Test.java',
        '**/*Tests.java'
      ]
    });

    return files;
  }

  /**
   * DTO/Entity sınıflarını çıkarır
   */
  private extractDtos(content: string, filePath: string): void {
    const regex = new RegExp(DTO_CLASS_REGEX.source, 'gi');
    let match;

    while ((match = regex.exec(content)) !== null) {
      const className = match[1];
      const classBody = match[2];

      const fields = this.extractDtoFields(classBody);

      if (fields.length > 0) {
        this.dtos.set(className, {
          name: className,
          fields,
          filePath
        });

        this.debug(`DTO bulundu: ${className} (${fields.length} field)`);
      }
    }
  }

  /**
   * DTO field'larını çıkarır
   */
  private extractDtoFields(classBody: string): Array<{ name: string; type: string }> {
    const fields: Array<{ name: string; type: string }> = [];
    const regex = new RegExp(JAVA_FIELD_REGEX.source, 'g');
    let match;

    while ((match = regex.exec(classBody)) !== null) {
      const type = match[1];
      const name = match[2];

      // Sabitler ve static field'ları atla
      if (name === name.toUpperCase()) continue;

      fields.push({ name, type });
    }

    return fields;
  }

  /**
   * Controller'lardan route'ları çıkarır
   */
  private extractRoutes(content: string, filePath: string): ExtractedRoute[] {
    const routes: ExtractedRoute[] = [];

    // Controller olup olmadığını kontrol et
    if (!content.includes('@RestController') && !content.includes('@Controller')) {
      return routes;
    }

    // Class seviyesi base path'i bul
    let basePath = '';
    const classMapping = content.match(CLASS_REQUEST_MAPPING_REGEX);
    if (classMapping) {
      basePath = classMapping[1];
    }

    // Class adını bul
    const classMatch = content.match(/public\s+class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : 'Unknown';

    // Her HTTP metod mapping'i için tara
    for (const [method, pattern] of Object.entries(MAPPING_PATTERNS)) {
      const regex = new RegExp(pattern.source, 'gi');
      let match;

      while ((match = regex.exec(content)) !== null) {
        const path = match[1] || '';
        const fullPath = this.joinPaths(basePath, path);

        // Metod tanımını bul
        const afterMatch = content.slice(match.index + match[0].length);
        const methodDefMatch = afterMatch.match(METHOD_DEF_REGEX);

        if (methodDefMatch) {
          routes.push({
            method: method as HttpMethod,
            path: fullPath,
            methodName: methodDefMatch[1],
            className,
            methodParams: methodDefMatch[2],
            filePath
          });

          this.debug(`Route bulundu: ${method} ${fullPath} -> ${className}.${methodDefMatch[1]}()`);
        }
      }
    }

    // @RequestMapping(method = RequestMethod.XXX) pattern'i
    const reqMappingRegex = new RegExp(REQUEST_MAPPING_METHOD_REGEX.source, 'gi');
    let reqMatch;

    while ((reqMatch = reqMappingRegex.exec(content)) !== null) {
      const method = reqMatch[1].toUpperCase();
      const path = reqMatch[2] || '';
      const fullPath = this.joinPaths(basePath, path);

      const httpMethod = this.parseHttpMethod(method);
      if (!httpMethod) continue;

      const afterMatch = content.slice(reqMatch.index + reqMatch[0].length);
      const methodDefMatch = afterMatch.match(METHOD_DEF_REGEX);

      if (methodDefMatch) {
        routes.push({
          method: httpMethod,
          path: fullPath,
          methodName: methodDefMatch[1],
          className,
          methodParams: methodDefMatch[2],
          filePath
        });
      }
    }

    return routes;
  }

  /**
   * İki path'i birleştirir
   */
  private joinPaths(base: string, path: string): string {
    if (!base && !path) return '/';

    const normalizedBase = base ? base.replace(/\/$/, '') : '';
    const normalizedPath = path ? (path.startsWith('/') ? path : '/' + path) : '';

    return normalizedBase + normalizedPath || '/';
  }

  /**
   * Route'u endpoint'e dönüştürür
   */
  private routeToEndpoint(route: ExtractedRoute): ApiEndpoint {
    const parameters: ApiParameter[] = [];
    let requestBody: ApiRequestBody | undefined;

    // Metod parametrelerini parse et
    this.parseMethodParams(route.methodParams, parameters, (bodyType) => {
      const dto = this.dtos.get(bodyType);
      if (dto) {
        requestBody = {
          required: true,
          contentType: 'application/json',
          schema: this.dtoToSchema(dto)
        };
      } else {
        requestBody = {
          required: true,
          contentType: 'application/json',
          schema: { type: SchemaType.OBJECT }
        };
      }
    });

    // Path parametrelerini path'ten çıkar
    const pathParams = this.extractPathParams(route.path);
    for (const paramName of pathParams) {
      if (!parameters.find(p => p.name === paramName)) {
        parameters.push({
          name: paramName,
          in: ParameterLocation.PATH,
          required: true,
          schema: { type: SchemaType.STRING }
        });
      }
    }

    // Spring Boot path parametrelerini OpenAPI formatına çevir
    const openApiPath = route.path.replace(/\{(\w+)\}/g, '{$1}');

    return {
      method: route.method,
      path: this.normalizePath(openApiPath),
      summary: this.generateSummary(route.methodName),
      operationId: `${route.className}_${route.methodName}`,
      parameters,
      requestBody,
      responses: [
        this.createDefaultResponse(200, 'Successful Response')
      ]
    };
  }

  /**
   * Metod parametrelerini parse eder
   */
  private parseMethodParams(
    paramsStr: string,
    parameters: ApiParameter[],
    onRequestBody: (type: string) => void
  ): void {
    if (!paramsStr.trim()) return;

    // @PathVariable
    let match;
    const pathVarRegex = new RegExp(PATH_VARIABLE_REGEX.source, 'g');
    while ((match = pathVarRegex.exec(paramsStr)) !== null) {
      const explicitName = match[1];
      const type = match[2];
      const paramName = match[3];

      parameters.push({
        name: explicitName || paramName,
        in: ParameterLocation.PATH,
        required: true,
        schema: { type: this.javaTypeToSchemaType(type) }
      });
    }

    // @RequestParam
    const reqParamRegex = new RegExp(REQUEST_PARAM_REGEX.source, 'g');
    while ((match = reqParamRegex.exec(paramsStr)) !== null) {
      const type = match[1];
      const paramName = match[2];

      parameters.push({
        name: paramName,
        in: ParameterLocation.QUERY,
        required: false, // Varsayılan olarak opsiyonel
        schema: { type: this.javaTypeToSchemaType(type) }
      });
    }

    // @RequestBody
    const bodyMatch = paramsStr.match(REQUEST_BODY_REGEX);
    if (bodyMatch) {
      onRequestBody(bodyMatch[1]);
    }
  }

  /**
   * Java tipini SchemaType'a dönüştürür
   */
  private javaTypeToSchemaType(javaType: string): SchemaType {
    const cleanType = javaType.split('<')[0].trim();
    return JAVA_TYPE_MAP[cleanType] || SchemaType.STRING;
  }

  /**
   * DTO'yu ApiSchema'ya dönüştürür
   */
  private dtoToSchema(dto: ExtractedDto): ApiSchema {
    const properties: Record<string, ApiSchema> = {};

    for (const field of dto.fields) {
      properties[field.name] = {
        type: this.javaTypeToSchemaType(field.type)
      };
    }

    return {
      type: SchemaType.OBJECT,
      properties
    };
  }

  /**
   * Metod adından özet oluşturur
   */
  private generateSummary(methodName: string): string {
    // camelCase'i boşluklara çevir
    const words = methodName.replace(/([A-Z])/g, ' $1').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /**
   * Endpoint'leri controller bazlı gruplar
   */
  private groupEndpointsByController(
    endpoints: ApiEndpoint[],
    routes: ExtractedRoute[]
  ): ApiGroup[] {
    const groups = new Map<string, ApiEndpoint[]>();

    for (let i = 0; i < endpoints.length; i++) {
      const route = routes[i];
      const groupName = route.className.replace(/Controller$/, '');

      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }

      groups.get(groupName)!.push(endpoints[i]);
    }

    return Array.from(groups.entries()).map(([name, eps]) => ({
      name,
      endpoints: eps
    }));
  }

  /**
   * Proje adını çıkarır
   */
  private extractProjectName(projectPath: string): string {
    // pom.xml'den artifactId çekmeye çalış
    const pomPath = path.join(projectPath, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      const content = fs.readFileSync(pomPath, 'utf-8');
      const artifactMatch = content.match(/<artifactId>([^<]+)<\/artifactId>/);
      if (artifactMatch) {
        return artifactMatch[1];
      }
    }

    // build.gradle'dan proje adı çekmeye çalış
    const gradlePath = path.join(projectPath, 'build.gradle');
    if (fs.existsSync(gradlePath)) {
      const content = fs.readFileSync(gradlePath, 'utf-8');
      const nameMatch = content.match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
      if (nameMatch) {
        return nameMatch[1];
      }
    }

    return path.basename(projectPath);
  }
}

export default SpringBootExtractor;
