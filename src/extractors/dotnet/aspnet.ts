/**
 * Apigen - ASP.NET Core Extractor
 *
 * Bu modül, C# ASP.NET Core projelerini statik olarak analiz eder.
 * Regex tabanlı "best-effort" analiz yapar.
 *
 * Taranan pattern'ler:
 * - [ApiController] attribute
 * - [Route("api/[controller]")]
 * - [HttpGet], [HttpPost], [HttpPut], [HttpDelete], [HttpPatch]
 * - [FromBody], [FromQuery], [FromRoute] parametreleri
 * - public class XxxController : ControllerBase
 * - DTO sınıfları ve record'lar
 *
 * Sınırlamalar:
 * - Minimal API (app.MapGet vb.) desteklenmez
 * - Attribute routing dışındaki yöntemler algılanmaz
 * - Generic controller'lar desteklenmez
 *
 * @module extractors/dotnet/aspnet
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
 * - [ApiController] public class UserController : ControllerBase
 * - [Route("api/[controller]")] public class ItemsController : Controller
 * - public class CategoriesController : ApiController (özel base class)
 * - public sealed class XxxController : BaseController
 */
const CONTROLLER_CLASS_REGEX = /(?:\[ApiController\][\s\S]*?)?(?:\[Route\s*\(\s*["']([^"']+)["']\s*\)\][\s\S]*?)?public\s+(?:sealed\s+)?class\s+(\w+Controller)\s*:\s*(\w+)/gi;

/**
 * Controller base class'ları
 * Bu isimlerden birinden türeyen sınıflar controller olarak kabul edilir
 */
const CONTROLLER_BASE_CLASSES = [
  'ControllerBase',
  'Controller',
  'ApiController',
  'BaseController',
  'BaseApiController'
];

/**
 * HTTP metod attribute pattern'leri
 */
const HTTP_METHOD_PATTERNS: Record<string, RegExp> = {
  GET: /\[HttpGet(?:\s*\(\s*["']?([^"'\]]+)?["']?\s*\))?\]/gi,
  POST: /\[HttpPost(?:\s*\(\s*["']?([^"'\]]+)?["']?\s*\))?\]/gi,
  PUT: /\[HttpPut(?:\s*\(\s*["']?([^"'\]]+)?["']?\s*\))?\]/gi,
  DELETE: /\[HttpDelete(?:\s*\(\s*["']?([^"'\]]+)?["']?\s*\))?\]/gi,
  PATCH: /\[HttpPatch(?:\s*\(\s*["']?([^"'\]]+)?["']?\s*\))?\]/gi
};

/**
 * C# metod tanımı pattern'i
 */
const METHOD_DEF_REGEX = /public\s+(?:async\s+)?(?:Task<)?(?:ActionResult<)?(\w+(?:<[^>]+>)?)\>?\>?\s+(\w+)\s*\(([^)]*)\)/;

/**
 * [FromRoute] pattern'i
 */
const FROM_ROUTE_REGEX = /\[FromRoute(?:\s*\([^)]*\))?\]\s*(\w+)\s+(\w+)/g;

/**
 * [FromQuery] pattern'i
 */
const FROM_QUERY_REGEX = /\[FromQuery(?:\s*\([^)]*\))?\]\s*(\w+)\s+(\w+)/g;

/**
 * [FromBody] pattern'i
 */
const FROM_BODY_REGEX = /\[FromBody\]\s*(\w+)\s+(\w+)/;

/**
 * C# DTO/Record pattern'i
 */
const DTO_CLASS_REGEX = /public\s+(?:class|record)\s+(\w+(?:Dto|DTO|Request|Response|Model)?)\s*(?:\([^)]*\)|{([^}]*))/gi;

/**
 * C# property pattern'i
 */
const PROPERTY_REGEX = /public\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*{\s*get;\s*(?:set;|init;)?\s*}/g;

// ============================================================================
// TİP DÖNÜŞÜMÜ
// ============================================================================

const CSHARP_TYPE_MAP: Record<string, SchemaType> = {
  'string': SchemaType.STRING,
  'String': SchemaType.STRING,
  'int': SchemaType.INTEGER,
  'Int32': SchemaType.INTEGER,
  'long': SchemaType.INTEGER,
  'Int64': SchemaType.INTEGER,
  'double': SchemaType.NUMBER,
  'Double': SchemaType.NUMBER,
  'float': SchemaType.NUMBER,
  'Single': SchemaType.NUMBER,
  'decimal': SchemaType.NUMBER,
  'Decimal': SchemaType.NUMBER,
  'bool': SchemaType.BOOLEAN,
  'Boolean': SchemaType.BOOLEAN,
  'List': SchemaType.ARRAY,
  'IList': SchemaType.ARRAY,
  'IEnumerable': SchemaType.ARRAY,
  'Array': SchemaType.ARRAY,
  'Dictionary': SchemaType.OBJECT,
  'IDictionary': SchemaType.OBJECT,
  'object': SchemaType.OBJECT,
  'Object': SchemaType.OBJECT,
  'Guid': SchemaType.STRING,
  'DateTime': SchemaType.STRING,
  'DateTimeOffset': SchemaType.STRING
};

// ============================================================================
// YARDIMCI TİPLER
// ============================================================================

interface ExtractedRoute {
  method: HttpMethod;
  path: string;
  methodName: string;
  controllerName: string;
  methodParams: string;
  returnType: string;
  filePath: string;
}

interface ExtractedDto {
  name: string;
  properties: Array<{ name: string; type: string }>;
  filePath: string;
}

interface ControllerInfo {
  name: string;
  basePath: string;
  filePath: string;
}

// ============================================================================
// ASP.NET CORE EXTRACTOR
// ============================================================================

/**
 * ASP.NET Core Extractor
 *
 * C# ASP.NET Core projelerini regex ile analiz eder.
 */
export class AspNetExtractor extends BaseExtractor {
  protected readonly projectType = ProjectType.ASPNET_CORE;
  protected readonly name = 'AspNetExtractor';

  /** Bulunan DTO'lar */
  private dtos: Map<string, ExtractedDto> = new Map();

  /** Bulunan Controller'lar */
  private controllers: Map<string, ControllerInfo> = new Map();

  /**
   * ASP.NET Core projesini analiz eder
   */
  public async extract(source: string, config: ApigenConfig): Promise<ExtractorResult> {
    this.info(`ASP.NET Core projesi taranıyor: ${source}`);

    this.dtos.clear();
    this.controllers.clear();

    const warnings: string[] = [];

    try {
      // 1. C# dosyalarını bul
      const csFiles = await this.findCSharpFiles(source);

      if (csFiles.length === 0) {
        return this.createErrorResult(['C# dosyası bulunamadı']);
      }

      this.debug(`${csFiles.length} C# dosyası bulundu`);

      // 2. İlk geçişte DTO'ları ve Controller tanımlarını çıkar
      for (const csFile of csFiles) {
        const filePath = path.join(source, csFile);
        const content = fs.readFileSync(filePath, 'utf-8');

        this.extractDtos(content, filePath);
        this.extractControllerDefinitions(content, filePath);
      }

      // 3. İkinci geçişte Controller'lardan endpoint'leri çıkar
      const allRoutes: ExtractedRoute[] = [];

      for (const csFile of csFiles) {
        const filePath = path.join(source, csFile);
        const content = fs.readFileSync(filePath, 'utf-8');

        const routes = this.extractRoutes(content, filePath);
        allRoutes.push(...routes);
      }

      if (allRoutes.length === 0) {
        return this.createErrorResult([
          'ASP.NET Core endpoint bulunamadı',
          'İpucu: [ApiController], [HttpGet], [HttpPost] gibi attribute\'lar aranıyor'
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

      warnings.push('ASP.NET Core extractor experimental\'dir. Tüm endpoint\'ler algılanmamış olabilir.');

      return this.createSuccessResult(project, csFiles.length, warnings);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error(`Parse hatası: ${errorMessage}`);

      return this.createErrorResult([`ASP.NET Core parse hatası: ${errorMessage}`]);
    }
  }

  /**
   * C# dosyalarını bulur
   */
  private async findCSharpFiles(projectPath: string): Promise<string[]> {
    const files = await glob('**/*.cs', {
      cwd: projectPath,
      ignore: [
        '**/bin/**',
        '**/obj/**',
        '**/Migrations/**',
        '**/*Test*.cs',
        '**/*.Tests/**'
      ]
    });

    return files;
  }

  /**
   * DTO sınıflarını çıkarır
   */
  private extractDtos(content: string, filePath: string): void {
    const regex = new RegExp(DTO_CLASS_REGEX.source, 'gi');
    let match;

    while ((match = regex.exec(content)) !== null) {
      const className = match[1];
      const classBody = match[2] || '';

      const properties = this.extractDtoProperties(classBody);

      if (properties.length > 0 || className.includes('Dto') || className.includes('Request') || className.includes('Response')) {
        this.dtos.set(className, {
          name: className,
          properties,
          filePath
        });

        this.debug(`DTO bulundu: ${className} (${properties.length} property)`);
      }
    }
  }

  /**
   * DTO property'lerini çıkarır
   */
  private extractDtoProperties(classBody: string): Array<{ name: string; type: string }> {
    const properties: Array<{ name: string; type: string }> = [];
    const regex = new RegExp(PROPERTY_REGEX.source, 'g');
    let match;

    while ((match = regex.exec(classBody)) !== null) {
      const type = match[1];
      const name = match[2];

      properties.push({ name, type });
    }

    return properties;
  }

  /**
   * Controller tanımlarını çıkarır
   */
  private extractControllerDefinitions(content: string, filePath: string): void {
    const regex = new RegExp(CONTROLLER_CLASS_REGEX.source, 'gi');
    let match;

    while ((match = regex.exec(content)) !== null) {
      const routeTemplate = match[1] || '';
      const controllerName = match[2];
      const baseClassName = match[3];

      // Base class'ın geçerli bir controller base class'ı olup olmadığını kontrol et
      const isValidController = CONTROLLER_BASE_CLASSES.some(
        base => baseClassName.includes(base) || baseClassName.endsWith('Controller')
      );

      if (!isValidController) {
        continue;
      }

      // [controller] placeholder'ını gerçek isimle değiştir
      // Route template yoksa otomatik oluştur
      let basePath: string;
      if (routeTemplate) {
        basePath = this.resolveRouteTemplate(routeTemplate, controllerName);
      } else {
        // Route attribute yoksa controller adından oluştur
        // CategoriesController -> /api/categories
        const shortName = controllerName.replace(/Controller$/, '').toLowerCase();
        basePath = `/api/${shortName}`;
      }

      this.controllers.set(controllerName, {
        name: controllerName,
        basePath,
        filePath
      });

      this.debug(`Controller bulundu: ${controllerName} (basePath: ${basePath}, baseClass: ${baseClassName})`);
    }
  }

  /**
   * Route template'ini çözümler
   *
   * [controller] -> Users (UserController -> Users)
   */
  private resolveRouteTemplate(template: string, controllerName: string): string {
    // Controller adından "Controller" suffix'ini kaldır
    const shortName = controllerName.replace(/Controller$/, '');

    return template
      .replace(/\[controller\]/gi, shortName.toLowerCase())
      .replace(/\[action\]/gi, ''); // Action placeholder'ı metod seviyesinde çözülür
  }

  /**
   * Controller'lardan route'ları çıkarır
   */
  private extractRoutes(content: string, filePath: string): ExtractedRoute[] {
    const routes: ExtractedRoute[] = [];

    // Bu dosyada controller var mı kontrol et
    // sealed class da destekleniyor
    const controllerMatch = content.match(/public\s+(?:sealed\s+)?class\s+(\w+Controller)\s*:/);
    if (!controllerMatch) {
      return routes;
    }

    const controllerName = controllerMatch[1];
    const controllerInfo = this.controllers.get(controllerName);
    const basePath = controllerInfo?.basePath || '';

    // Her HTTP metod attribute'u için tara
    for (const [method, pattern] of Object.entries(HTTP_METHOD_PATTERNS)) {
      const regex = new RegExp(pattern.source, 'gi');
      let match;

      while ((match = regex.exec(content)) !== null) {
        const routePath = match[1] || '';
        const fullPath = this.joinPaths(basePath, routePath);

        // Metod tanımını bul
        const afterMatch = content.slice(match.index + match[0].length);
        const methodDefMatch = afterMatch.match(METHOD_DEF_REGEX);

        if (methodDefMatch) {
          routes.push({
            method: method as HttpMethod,
            path: fullPath,
            methodName: methodDefMatch[2],
            controllerName,
            methodParams: methodDefMatch[3],
            returnType: methodDefMatch[1],
            filePath
          });

          this.debug(`Route bulundu: ${method} ${fullPath} -> ${controllerName}.${methodDefMatch[2]}()`);
        }
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

    // Path'teki {param} parametrelerini çıkar ve ekle
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

    // Response schema'sı (return type'dan)
    let responseSchema: ApiSchema | undefined;
    if (route.returnType && route.returnType !== 'IActionResult' && route.returnType !== 'ActionResult') {
      const dto = this.dtos.get(route.returnType);
      if (dto) {
        responseSchema = this.dtoToSchema(dto);
      }
    }

    return {
      method: route.method,
      path: this.normalizePath(route.path),
      summary: this.generateSummary(route.methodName),
      operationId: `${route.controllerName}_${route.methodName}`,
      parameters,
      requestBody,
      responses: [
        {
          statusCode: 200,
          description: 'Successful Response',
          contentType: 'application/json',
          schema: responseSchema
        }
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

    // [FromRoute]
    let match;
    const fromRouteRegex = new RegExp(FROM_ROUTE_REGEX.source, 'g');
    while ((match = fromRouteRegex.exec(paramsStr)) !== null) {
      const type = match[1];
      const paramName = match[2];

      parameters.push({
        name: paramName,
        in: ParameterLocation.PATH,
        required: true,
        schema: { type: this.csharpTypeToSchemaType(type) }
      });
    }

    // [FromQuery]
    const fromQueryRegex = new RegExp(FROM_QUERY_REGEX.source, 'g');
    while ((match = fromQueryRegex.exec(paramsStr)) !== null) {
      const type = match[1];
      const paramName = match[2];

      parameters.push({
        name: paramName,
        in: ParameterLocation.QUERY,
        required: false,
        schema: { type: this.csharpTypeToSchemaType(type) }
      });
    }

    // [FromBody]
    const bodyMatch = paramsStr.match(FROM_BODY_REGEX);
    if (bodyMatch) {
      onRequestBody(bodyMatch[1]);
    }

    // Attribute'suz parametreler (basit tipler query, complex tipler body)
    const simpleParamRegex = /(?<!\[\w+\])\s*(\w+)\s+(\w+)(?:\s*=|,|\))/g;
    while ((match = simpleParamRegex.exec(paramsStr)) !== null) {
      const type = match[1];
      const paramName = match[2];

      // Zaten eklenmiş mi kontrol et
      if (parameters.find(p => p.name === paramName)) continue;

      // Basit tip mi?
      if (CSHARP_TYPE_MAP[type]) {
        // Path'te varsa path param, yoksa query param
        // Bu basit bir varsayım, gerçekte daha karmaşık olabilir
        parameters.push({
          name: paramName,
          in: ParameterLocation.QUERY,
          required: false,
          schema: { type: this.csharpTypeToSchemaType(type) }
        });
      }
    }
  }

  /**
   * C# tipini SchemaType'a dönüştürür
   */
  private csharpTypeToSchemaType(csharpType: string): SchemaType {
    const cleanType = csharpType.split('<')[0].trim();
    return CSHARP_TYPE_MAP[cleanType] || SchemaType.STRING;
  }

  /**
   * DTO'yu ApiSchema'ya dönüştürür
   */
  private dtoToSchema(dto: ExtractedDto): ApiSchema {
    const properties: Record<string, ApiSchema> = {};

    for (const prop of dto.properties) {
      properties[prop.name] = {
        type: this.csharpTypeToSchemaType(prop.type)
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
    // PascalCase'i boşluklara çevir
    const words = methodName.replace(/([A-Z])/g, ' $1').trim();
    return words;
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
      const groupName = route.controllerName.replace(/Controller$/, '');

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
    // .csproj dosyasından proje adını çek
    const csprojFiles = fs.readdirSync(projectPath).filter(f => f.endsWith('.csproj'));

    if (csprojFiles.length > 0) {
      return csprojFiles[0].replace('.csproj', '');
    }

    return path.basename(projectPath);
  }
}

export default AspNetExtractor;
