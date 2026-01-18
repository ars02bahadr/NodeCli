/**
 * Apigen - Flask Extractor
 *
 * Bu modül, Python Flask projelerini statik olarak analiz eder.
 * Regex tabanlı "best-effort" analiz yapar.
 *
 * Taranan pattern'ler:
 * - @app.route("/path", methods=["GET", "POST"])
 * - @app.get("/path"), @app.post("/path") (Flask 2.0+)
 * - Blueprint tanımları ve prefix'leri
 * - Route parametreleri (<param>, <int:id>, vb.)
 *
 * Sınırlamalar:
 * - Flask-RESTful class-based view'lar tam desteklenmez
 * - Dinamik route'lar algılanmaz
 * - MethodView sınıfları desteklenmez
 *
 * @module extractors/python/flask
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
 * Flask @app.route() decorator pattern'i
 *
 * Yakalar:
 * - @app.route("/users")
 * - @app.route("/users/<int:id>", methods=["GET", "POST"])
 * - @bp.route("/items", methods=['DELETE'])
 */
const ROUTE_DECORATOR_REGEX = /@(\w+)\.route\s*\(\s*["']([^"']+)["'](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?\s*\)/gi;

/**
 * Flask 2.0+ shortcut decorator'ları
 *
 * Yakalar:
 * - @app.get("/users")
 * - @bp.post("/items")
 */
const SHORTCUT_DECORATOR_REGEX = /@(\w+)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/gi;

/**
 * Blueprint tanımı pattern'i
 *
 * Yakalar:
 * - bp = Blueprint('users', __name__)
 * - users_bp = Blueprint('users', __name__, url_prefix='/users')
 */
const BLUEPRINT_DEFINITION_REGEX = /(\w+)\s*=\s*Blueprint\s*\(\s*["'](\w+)["']\s*,\s*[^)]+(?:url_prefix\s*=\s*["']([^"']+)["'])?\s*\)/gi;

/**
 * Flask parametre pattern'leri
 *
 * Yakalar:
 * - <id>
 * - <int:user_id>
 * - <string:name>
 * - <path:file_path>
 */
const FLASK_PARAM_REGEX = /<(?:(\w+):)?(\w+)>/g;

/**
 * Fonksiyon tanımı pattern'i
 */
const FUNCTION_DEF_REGEX = /def\s+(\w+)\s*\(([^)]*)\)/;

// ============================================================================
// TİP DÖNÜŞÜMÜ
// ============================================================================

/**
 * Flask parametre tiplerini SchemaType'a dönüştürme tablosu
 */
const FLASK_TYPE_MAP: Record<string, SchemaType> = {
  'int': SchemaType.INTEGER,
  'float': SchemaType.NUMBER,
  'string': SchemaType.STRING,
  'path': SchemaType.STRING,
  'uuid': SchemaType.STRING,
  'any': SchemaType.STRING
};

// ============================================================================
// YARDIMCI TİPLER
// ============================================================================

interface ExtractedRoute {
  methods: HttpMethod[];
  path: string;
  functionName: string;
  blueprintName: string | null;
  filePath: string;
  lineNumber: number;
}

interface BlueprintInfo {
  name: string;
  variableName: string;
  prefix: string;
  filePath: string;
}

// ============================================================================
// FLASK EXTRACTOR
// ============================================================================

/**
 * Flask Extractor
 *
 * Python Flask projelerini regex ile analiz eder.
 *
 * @example
 * ```typescript
 * const extractor = new FlaskExtractor();
 * const result = await extractor.extract('/path/to/flask/project', config);
 * ```
 */
export class FlaskExtractor extends BaseExtractor {
  protected readonly projectType = ProjectType.FLASK;
  protected readonly name = 'FlaskExtractor';

  /** Bulunan Blueprint'ler */
  private blueprints: Map<string, BlueprintInfo> = new Map();

  /**
   * Flask projesini analiz eder
   *
   * @param source - Proje dizini
   * @param config - Apigen konfigürasyonu
   * @returns Extraction sonucu
   */
  public async extract(source: string, config: ApigenConfig): Promise<ExtractorResult> {
    this.info(`Flask projesi taranıyor: ${source}`);

    // State'i temizle
    this.blueprints.clear();

    const warnings: string[] = [];

    try {
      // 1. Python dosyalarını bul
      const pyFiles = await this.findPythonFiles(source);

      if (pyFiles.length === 0) {
        return this.createErrorResult(['Python dosyası bulunamadı']);
      }

      this.debug(`${pyFiles.length} Python dosyası bulundu`);

      // 2. Her dosyayı tara
      const allRoutes: ExtractedRoute[] = [];

      for (const pyFile of pyFiles) {
        const filePath = path.join(source, pyFile);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Blueprint tanımlarını çıkar
        this.extractBlueprintDefinitions(content, filePath);

        // Route'ları çıkar
        const routes = this.extractRoutes(content, filePath);
        allRoutes.push(...routes);
      }

      if (allRoutes.length === 0) {
        return this.createErrorResult([
          'Flask route bulunamadı',
          'İpucu: @app.route(), @bp.route() gibi decorator\'ler aranıyor'
        ]);
      }

      // 3. Proje oluştur
      const project = this.createEmptyProject(source, config);
      project.info.title = this.extractProjectName(source);

      // 4. Route'ları endpoint'lere dönüştür
      const endpoints: ApiEndpoint[] = [];
      const endpointRouteMap: Map<ApiEndpoint, ExtractedRoute> = new Map();

      for (const route of allRoutes) {
        // Her HTTP metodu için ayrı endpoint
        for (const method of route.methods) {
          const endpoint = this.routeToEndpoint(route, method);
          endpoints.push(endpoint);
          endpointRouteMap.set(endpoint, route);
        }
      }

      // 5. Blueprint bazlı gruplama
      project.groups = this.groupEndpointsByBlueprint(endpoints, endpointRouteMap);

      this.info(`${endpoints.length} endpoint başarıyla çıkarıldı`);

      warnings.push('Flask extractor experimental\'dir. Tüm endpoint\'ler algılanmamış olabilir.');

      return this.createSuccessResult(project, pyFiles.length, warnings);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error(`Parse hatası: ${errorMessage}`);

      return this.createErrorResult([`Flask parse hatası: ${errorMessage}`]);
    }
  }

  /**
   * Python dosyalarını bulur
   */
  private async findPythonFiles(projectPath: string): Promise<string[]> {
    const files = await glob('**/*.py', {
      cwd: projectPath,
      ignore: [
        '**/venv/**',
        '**/.venv/**',
        '**/env/**',
        '**/__pycache__/**',
        '**/site-packages/**',
        '**/test*/**',
        '**/*_test.py',
        '**/tests/**'
      ]
    });

    return files;
  }

  /**
   * Blueprint tanımlarını çıkarır
   */
  private extractBlueprintDefinitions(content: string, filePath: string): void {
    const regex = new RegExp(BLUEPRINT_DEFINITION_REGEX.source, 'gi');
    let match;

    while ((match = regex.exec(content)) !== null) {
      const variableName = match[1];
      const blueprintName = match[2];
      const prefix = match[3] || '';

      this.blueprints.set(variableName, {
        name: blueprintName,
        variableName,
        prefix,
        filePath
      });

      this.debug(`Blueprint bulundu: ${variableName} (prefix: ${prefix || 'yok'})`);
    }
  }

  /**
   * Route'ları çıkarır
   */
  private extractRoutes(content: string, filePath: string): ExtractedRoute[] {
    const routes: ExtractedRoute[] = [];
    const lines = content.split('\n');

    // @app.route() ve @bp.route() pattern'leri
    let regex = new RegExp(ROUTE_DECORATOR_REGEX.source, 'gi');
    let match;

    while ((match = regex.exec(content)) !== null) {
      const appOrBp = match[1];
      const routePath = match[2];
      const methodsStr = match[3];

      // Metodları parse et
      let methods: HttpMethod[] = [HttpMethod.GET]; // Varsayılan GET

      if (methodsStr) {
        methods = this.parseMethodsString(methodsStr);
      }

      const lineNumber = content.slice(0, match.index).split('\n').length;
      const functionName = this.findFunctionName(lines, lineNumber);

      // Blueprint mı app mı?
      const blueprintName = appOrBp.toLowerCase() === 'app' ? null : appOrBp;

      routes.push({
        methods,
        path: routePath,
        functionName,
        blueprintName,
        filePath,
        lineNumber
      });

      this.debug(`Route bulundu: ${methods.join('|')} ${routePath} -> ${functionName}()`);
    }

    // Flask 2.0+ shortcut decorator'ları (@app.get, @app.post, vb.)
    regex = new RegExp(SHORTCUT_DECORATOR_REGEX.source, 'gi');

    while ((match = regex.exec(content)) !== null) {
      const appOrBp = match[1];
      const methodStr = match[2].toUpperCase();
      const routePath = match[3];

      const method = this.parseHttpMethod(methodStr);
      if (!method) continue;

      const lineNumber = content.slice(0, match.index).split('\n').length;
      const functionName = this.findFunctionName(lines, lineNumber);

      const blueprintName = appOrBp.toLowerCase() === 'app' ? null : appOrBp;

      routes.push({
        methods: [method],
        path: routePath,
        functionName,
        blueprintName,
        filePath,
        lineNumber
      });

      this.debug(`Shortcut route bulundu: ${method} ${routePath} -> ${functionName}()`);
    }

    return routes;
  }

  /**
   * methods=[...] string'ini parse eder
   */
  private parseMethodsString(methodsStr: string): HttpMethod[] {
    const methods: HttpMethod[] = [];

    // "GET", 'POST' gibi değerleri çıkar
    const regex = /["'](\w+)["']/g;
    let match;

    while ((match = regex.exec(methodsStr)) !== null) {
      const method = this.parseHttpMethod(match[1]);
      if (method) {
        methods.push(method);
      }
    }

    return methods.length > 0 ? methods : [HttpMethod.GET];
  }

  /**
   * Decorator'dan sonraki fonksiyon adını bulur
   */
  private findFunctionName(lines: string[], lineNumber: number): string {
    for (let i = lineNumber; i < lines.length && i < lineNumber + 5; i++) {
      const funcMatch = lines[i].match(FUNCTION_DEF_REGEX);
      if (funcMatch) {
        return funcMatch[1];
      }
    }
    return 'unknown';
  }

  /**
   * Route'u endpoint'e dönüştürür
   */
  private routeToEndpoint(route: ExtractedRoute, method: HttpMethod): ApiEndpoint {
    // Blueprint prefix'ini uygula
    let fullPath = route.path;

    if (route.blueprintName) {
      const bp = this.blueprints.get(route.blueprintName);
      if (bp && bp.prefix) {
        fullPath = bp.prefix + fullPath;
      }
    }

    // Flask parametrelerini OpenAPI formatına çevir ve parametreleri çıkar
    const parameters: ApiParameter[] = [];
    const convertedPath = fullPath.replace(FLASK_PARAM_REGEX, (match, type, name) => {
      const schemaType = type ? (FLASK_TYPE_MAP[type] || SchemaType.STRING) : SchemaType.STRING;

      parameters.push({
        name,
        in: ParameterLocation.PATH,
        required: true,
        schema: { type: schemaType },
        description: type ? `${type} parameter` : undefined
      });

      return `{${name}}`;
    });

    return {
      method,
      path: this.normalizePath(convertedPath),
      summary: this.generateSummary(route.functionName, method),
      operationId: `${route.functionName}_${method.toLowerCase()}`,
      parameters,
      responses: [
        this.createDefaultResponse(200, 'Successful Response')
      ]
    };
  }

  /**
   * Fonksiyon adından özet oluşturur
   */
  private generateSummary(funcName: string, method: string): string {
    const words = funcName.split('_');
    return words
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  /**
   * Endpoint'leri blueprint bazlı gruplar
   */
  private groupEndpointsByBlueprint(
    endpoints: ApiEndpoint[],
    routeMap: Map<ApiEndpoint, ExtractedRoute>
  ): ApiGroup[] {
    const groups = new Map<string, ApiEndpoint[]>();

    for (const endpoint of endpoints) {
      const route = routeMap.get(endpoint);
      let groupName = 'Default';

      if (route?.blueprintName) {
        const bp = this.blueprints.get(route.blueprintName);
        groupName = bp ? this.formatGroupName(bp.name) : route.blueprintName;
      }

      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }

      groups.get(groupName)!.push(endpoint);
    }

    return Array.from(groups.entries()).map(([name, eps]) => ({
      name,
      endpoints: eps
    }));
  }

  /**
   * Grup adını formatlar
   */
  private formatGroupName(name: string): string {
    return name
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  /**
   * Proje adını çıkarır
   */
  private extractProjectName(projectPath: string): string {
    const dirName = path.basename(projectPath);

    // setup.py veya pyproject.toml'dan ad çekmeye çalış
    const setupPath = path.join(projectPath, 'setup.py');
    if (fs.existsSync(setupPath)) {
      const content = fs.readFileSync(setupPath, 'utf-8');
      const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
      if (nameMatch) {
        return nameMatch[1];
      }
    }

    return dirName;
  }
}

export default FlaskExtractor;
