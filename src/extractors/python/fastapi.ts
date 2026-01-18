/**
 * Apigen - FastAPI Extractor
 *
 * Bu modül, Python FastAPI projelerini statik olarak analiz eder.
 * Regex tabanlı "best-effort" analiz yapar - tam Python parser değil.
 *
 * Taranan pattern'ler:
 * - @app.get("/path"), @app.post("/path"), vb.
 * - @router.get("/path"), @router.post("/path"), vb.
 * - APIRouter() tanımları ve prefix'leri
 * - Pydantic model sınıfları (BaseModel)
 * - Type hint'lerden parametre tipleri
 * - Path parametreleri ({param} formatı)
 * - Query parametreleri (Query() ile tanımlanmış)
 *
 * Sınırlamalar:
 * - Dinamik route'lar algılanmaz
 * - Runtime'da oluşturulan route'lar algılanmaz
 * - Karmaşık decorator zincirleri sorunlu olabilir
 * - Import edilen router'ların prefix'leri her zaman doğru algılanmayabilir
 *
 * @module extractors/python/fastapi
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
 * FastAPI route decorator pattern'i
 *
 * Yakalar:
 * - @app.get("/users")
 * - @router.post("/items/{item_id}")
 * - @app.put('/users/{user_id}', tags=["users"])
 */
const ROUTE_DECORATOR_REGEX = /@(app|router)\.(get|post|put|delete|patch|options|head)\s*\(\s*["']([^"']+)["']/gi;

/**
 * APIRouter tanımı pattern'i
 *
 * Yakalar:
 * - router = APIRouter()
 * - user_router = APIRouter(prefix="/users")
 * - items = APIRouter(prefix="/items", tags=["items"])
 */
const ROUTER_DEFINITION_REGEX = /(\w+)\s*=\s*APIRouter\s*\(([^)]*)\)/gi;

/**
 * Router prefix pattern'i
 *
 * APIRouter() içindeki prefix parametresini yakalar
 */
const ROUTER_PREFIX_REGEX = /prefix\s*=\s*["']([^"']+)["']/i;

/**
 * Pydantic BaseModel sınıfı pattern'i
 *
 * Yakalar:
 * - class UserCreate(BaseModel):
 * - class ItemResponse(BaseModel):
 */
const PYDANTIC_MODEL_REGEX = /class\s+(\w+)\s*\(\s*BaseModel\s*\)\s*:/gi;

/**
 * Pydantic model field pattern'i
 *
 * Yakalar:
 * - name: str
 * - age: int = 0
 * - email: Optional[str] = None
 * - items: List[Item]
 */
const MODEL_FIELD_REGEX = /^\s+(\w+)\s*:\s*([^=\n]+)(?:\s*=\s*(.+))?$/gm;

/**
 * FastAPI fonksiyon tanımı pattern'i
 *
 * Route decorator'dan sonra gelen async def veya def
 */
const FUNCTION_DEF_REGEX = /(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/;

/**
 * Python tip hint'lerini parse etmek için pattern'ler
 */
const TYPE_PATTERNS: Record<string, SchemaType> = {
  'str': SchemaType.STRING,
  'int': SchemaType.INTEGER,
  'float': SchemaType.NUMBER,
  'bool': SchemaType.BOOLEAN,
  'list': SchemaType.ARRAY,
  'dict': SchemaType.OBJECT,
  'List': SchemaType.ARRAY,
  'Dict': SchemaType.OBJECT,
  'Optional': SchemaType.STRING, // İç tipi ayrıca parse edilmeli
  'Any': SchemaType.STRING
};

// ============================================================================
// YARDIMCI TİPLER
// ============================================================================

/**
 * Çıkarılan route bilgisi
 */
interface ExtractedRoute {
  method: HttpMethod;
  path: string;
  functionName: string;
  routerName: string;
  filePath: string;
  lineNumber: number;
  functionParams: string;
}

/**
 * Çıkarılan Pydantic model
 */
interface ExtractedModel {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    default?: string;
  }>;
  filePath: string;
}

/**
 * Router bilgisi
 */
interface RouterInfo {
  name: string;
  prefix: string;
  filePath: string;
}

// ============================================================================
// FASTAPI EXTRACTOR
// ============================================================================

/**
 * FastAPI Extractor
 *
 * Python FastAPI projelerini regex ile analiz eder.
 *
 * @example
 * ```typescript
 * const extractor = new FastApiExtractor();
 * const result = await extractor.extract('/path/to/fastapi/project', config);
 * ```
 */
export class FastApiExtractor extends BaseExtractor {
  protected readonly projectType = ProjectType.FASTAPI;
  protected readonly name = 'FastApiExtractor';

  /** Bulunan Pydantic modeller */
  private models: Map<string, ExtractedModel> = new Map();

  /** Bulunan router'lar */
  private routers: Map<string, RouterInfo> = new Map();

  /**
   * FastAPI projesini analiz eder
   *
   * @param source - Proje dizini
   * @param config - Apigen konfigürasyonu
   * @returns Extraction sonucu
   */
  public async extract(source: string, config: ApigenConfig): Promise<ExtractorResult> {
    this.info(`FastAPI projesi taranıyor: ${source}`);

    // State'i temizle
    this.models.clear();
    this.routers.clear();

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

        // Router tanımlarını çıkar
        this.extractRouterDefinitions(content, filePath);

        // Pydantic modelleri çıkar
        this.extractPydanticModels(content, filePath);

        // Route'ları çıkar
        const routes = this.extractRoutes(content, filePath);
        allRoutes.push(...routes);
      }

      if (allRoutes.length === 0) {
        return this.createErrorResult([
          'FastAPI route bulunamadı',
          'İpucu: @app.get(), @router.post() gibi decorator\'ler aranıyor'
        ]);
      }

      // 3. Proje oluştur
      const project = this.createEmptyProject(source, config);
      project.info.title = this.extractProjectName(source);

      // 4. Route'ları endpoint'lere dönüştür
      const endpoints = allRoutes.map(route => this.routeToEndpoint(route));

      // 5. Dosya bazlı gruplama
      project.groups = this.groupEndpointsByFile(endpoints, allRoutes);

      this.info(`${endpoints.length} endpoint başarıyla çıkarıldı`);

      // Uyarı: Experimental özellik
      warnings.push('FastAPI extractor experimental\'dir. Tüm endpoint\'ler algılanmamış olabilir.');

      return this.createSuccessResult(project, pyFiles.length, warnings);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error(`Parse hatası: ${errorMessage}`);

      return this.createErrorResult([`FastAPI parse hatası: ${errorMessage}`]);
    }
  }

  /**
   * Python dosyalarını bulur
   *
   * @param projectPath - Proje dizini
   * @returns Python dosya yolları
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
   * Router tanımlarını çıkarır
   *
   * @param content - Dosya içeriği
   * @param filePath - Dosya yolu
   */
  private extractRouterDefinitions(content: string, filePath: string): void {
    const regex = new RegExp(ROUTER_DEFINITION_REGEX.source, 'gi');
    let match;

    while ((match = regex.exec(content)) !== null) {
      const routerName = match[1];
      const routerArgs = match[2];

      // Prefix'i çıkar
      let prefix = '';
      const prefixMatch = routerArgs.match(ROUTER_PREFIX_REGEX);
      if (prefixMatch) {
        prefix = prefixMatch[1];
      }

      this.routers.set(routerName, {
        name: routerName,
        prefix,
        filePath
      });

      this.debug(`Router bulundu: ${routerName} (prefix: ${prefix || 'yok'})`);
    }
  }

  /**
   * Pydantic model'leri çıkarır
   *
   * @param content - Dosya içeriği
   * @param filePath - Dosya yolu
   */
  private extractPydanticModels(content: string, filePath: string): void {
    const regex = new RegExp(PYDANTIC_MODEL_REGEX.source, 'gi');
    let match;

    while ((match = regex.exec(content)) !== null) {
      const modelName = match[1];
      const modelStart = match.index + match[0].length;

      // Model body'sini bul (bir sonraki class veya dosya sonuna kadar)
      const remainingContent = content.slice(modelStart);
      const nextClassMatch = remainingContent.match(/\nclass\s+\w+/);
      const modelEnd = nextClassMatch ? nextClassMatch.index! : remainingContent.length;
      const modelBody = remainingContent.slice(0, modelEnd);

      // Field'ları çıkar
      const fields = this.extractModelFields(modelBody);

      this.models.set(modelName, {
        name: modelName,
        fields,
        filePath
      });

      this.debug(`Pydantic model bulundu: ${modelName} (${fields.length} field)`);
    }
  }

  /**
   * Model field'larını çıkarır
   *
   * @param modelBody - Model body içeriği
   * @returns Field dizisi
   */
  private extractModelFields(modelBody: string): ExtractedModel['fields'] {
    const fields: ExtractedModel['fields'] = [];
    const lines = modelBody.split('\n');

    for (const line of lines) {
      // Sadece field tanımı olan satırları al (4 boşluk ile başlayan)
      if (!line.match(/^\s{4}\w+\s*:/)) continue;

      // Comment ve boş satırları atla
      if (line.trim().startsWith('#')) continue;
      if (line.trim() === '') continue;

      // Field'ı parse et
      const fieldMatch = line.match(/^\s+(\w+)\s*:\s*([^=\n]+?)(?:\s*=\s*(.+))?$/);
      if (fieldMatch) {
        const [, name, typeHint, defaultValue] = fieldMatch;

        // Özel field'ları atla
        if (name.startsWith('_')) continue;
        if (name === 'Config') continue;

        fields.push({
          name,
          type: typeHint.trim(),
          required: !defaultValue || defaultValue.includes('...'),
          default: defaultValue?.trim()
        });
      }
    }

    return fields;
  }

  /**
   * Route'ları çıkarır
   *
   * @param content - Dosya içeriği
   * @param filePath - Dosya yolu
   * @returns Çıkarılan route'lar
   */
  private extractRoutes(content: string, filePath: string): ExtractedRoute[] {
    const routes: ExtractedRoute[] = [];
    const lines = content.split('\n');

    const regex = new RegExp(ROUTE_DECORATOR_REGEX.source, 'gi');
    let match;

    while ((match = regex.exec(content)) !== null) {
      const routerName = match[1]; // 'app' veya 'router'
      const methodStr = match[2].toLowerCase();
      const routePath = match[3];

      // HTTP metodunu parse et
      const method = this.parseHttpMethod(methodStr);
      if (!method) continue;

      // Satır numarasını bul
      const lineNumber = content.slice(0, match.index).split('\n').length;

      // Fonksiyon tanımını bul (decorator'dan sonraki satırlar)
      let functionName = 'unknown';
      let functionParams = '';

      // Decorator'dan sonraki satırları tara
      for (let i = lineNumber; i < lines.length && i < lineNumber + 5; i++) {
        const funcMatch = lines[i].match(FUNCTION_DEF_REGEX);
        if (funcMatch) {
          functionName = funcMatch[1];
          functionParams = funcMatch[2];
          break;
        }
      }

      routes.push({
        method,
        path: routePath,
        functionName,
        routerName,
        filePath,
        lineNumber,
        functionParams
      });

      this.debug(`Route bulundu: ${method} ${routePath} -> ${functionName}()`);
    }

    return routes;
  }

  /**
   * Route'u endpoint'e dönüştürür
   *
   * @param route - Çıkarılan route
   * @returns ApiEndpoint
   */
  private routeToEndpoint(route: ExtractedRoute): ApiEndpoint {
    // Router prefix'ini uygula
    let fullPath = route.path;
    const routerInfo = this.routers.get(route.routerName);
    if (routerInfo && routerInfo.prefix) {
      fullPath = routerInfo.prefix + fullPath;
    }

    // Path parametrelerini çıkar
    const pathParams = this.extractPathParams(fullPath);

    // Fonksiyon parametrelerini parse et
    const funcParams = this.parseFunctionParams(route.functionParams);

    // Parametreleri oluştur
    const parameters: ApiParameter[] = [];

    // Path parametreleri
    for (const paramName of pathParams) {
      const funcParam = funcParams.find(p => p.name === paramName);
      parameters.push({
        name: paramName,
        in: ParameterLocation.PATH,
        required: true,
        schema: {
          type: funcParam ? this.pythonTypeToSchemaType(funcParam.type) : SchemaType.STRING
        }
      });
    }

    // Query parametreleri (path parametresi olmayan func params)
    for (const param of funcParams) {
      if (pathParams.includes(param.name)) continue;
      if (param.name === 'request' || param.name === 'db' || param.name === 'session') continue;

      // Body parametresi kontrolü (Pydantic model)
      if (this.models.has(param.type)) {
        continue; // Request body olarak işlenecek
      }

      parameters.push({
        name: param.name,
        in: ParameterLocation.QUERY,
        required: !param.hasDefault,
        schema: {
          type: this.pythonTypeToSchemaType(param.type)
        }
      });
    }

    // Request body (Pydantic model parametresi varsa)
    let requestBody: ApiRequestBody | undefined;
    const bodyParam = funcParams.find(p => this.models.has(p.type));
    if (bodyParam && ['POST', 'PUT', 'PATCH'].includes(route.method)) {
      const model = this.models.get(bodyParam.type)!;
      requestBody = {
        required: !bodyParam.hasDefault,
        contentType: 'application/json',
        schema: this.modelToSchema(model)
      };
    }

    return {
      method: route.method,
      path: this.normalizePath(fullPath),
      summary: this.generateSummary(route.functionName, route.method),
      operationId: route.functionName,
      parameters,
      requestBody,
      responses: [
        this.createDefaultResponse(200, 'Successful Response'),
        this.createDefaultResponse(422, 'Validation Error')
      ]
    };
  }

  /**
   * Fonksiyon parametrelerini parse eder
   *
   * @param paramsStr - Parametre string'i
   * @returns Parse edilmiş parametreler
   */
  private parseFunctionParams(paramsStr: string): Array<{
    name: string;
    type: string;
    hasDefault: boolean;
  }> {
    if (!paramsStr.trim()) return [];

    const params: Array<{ name: string; type: string; hasDefault: boolean }> = [];
    const parts = this.splitParams(paramsStr);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // self, cls, *args, **kwargs atla
      if (trimmed === 'self' || trimmed === 'cls') continue;
      if (trimmed.startsWith('*')) continue;

      // name: Type = default formatını parse et
      const match = trimmed.match(/^(\w+)\s*(?::\s*([^=]+))?\s*(?:=\s*(.+))?$/);
      if (match) {
        const [, name, type = 'Any', defaultValue] = match;
        params.push({
          name,
          type: type.trim(),
          hasDefault: defaultValue !== undefined
        });
      }
    }

    return params;
  }

  /**
   * Parametre string'ini virgüllere göre böler
   * (parantez içindeki virgülleri koruyarak)
   *
   * @param str - Parametre string'i
   * @returns Bölünmüş parçalar
   */
  private splitParams(str: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of str) {
      if (char === '(' || char === '[' || char === '{') {
        depth++;
        current += char;
      } else if (char === ')' || char === ']' || char === '}') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    if (current) {
      result.push(current);
    }

    return result;
  }

  /**
   * Python tipini SchemaType'a dönüştürür
   *
   * @param pythonType - Python tip string'i
   * @returns SchemaType
   */
  private pythonTypeToSchemaType(pythonType: string): SchemaType {
    const cleanType = pythonType.trim().split('[')[0]; // Generic'i kaldır

    return TYPE_PATTERNS[cleanType] || SchemaType.STRING;
  }

  /**
   * Pydantic model'i ApiSchema'ya dönüştürür
   *
   * @param model - Pydantic model
   * @returns ApiSchema
   */
  private modelToSchema(model: ExtractedModel): ApiSchema {
    const properties: Record<string, ApiSchema> = {};
    const required: string[] = [];

    for (const field of model.fields) {
      properties[field.name] = {
        type: this.pythonTypeToSchemaType(field.type),
        description: field.type
      };

      if (field.required) {
        required.push(field.name);
      }
    }

    return {
      type: SchemaType.OBJECT,
      properties,
      required: required.length > 0 ? required : undefined
    };
  }

  /**
   * Fonksiyon adından özet oluşturur
   *
   * @param funcName - Fonksiyon adı
   * @param method - HTTP metodu
   * @returns Özet string
   */
  private generateSummary(funcName: string, method: string): string {
    // snake_case'i Title Case'e çevir
    const words = funcName.split('_');
    const titleCase = words
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    return titleCase;
  }

  /**
   * Endpoint'leri dosya bazlı gruplar
   *
   * @param endpoints - Endpoint'ler
   * @param routes - Orijinal route bilgileri
   * @returns ApiGroup dizisi
   */
  private groupEndpointsByFile(
    endpoints: ApiEndpoint[],
    routes: ExtractedRoute[]
  ): ApiGroup[] {
    const groups = new Map<string, ApiEndpoint[]>();

    for (let i = 0; i < endpoints.length; i++) {
      const route = routes[i];
      const fileName = path.basename(route.filePath, '.py');

      // main.py -> Default, diğerleri dosya adı
      const groupName = fileName === 'main' ? 'Default' : this.formatGroupName(fileName);

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
   * Dosya adından grup adı oluşturur
   *
   * @param fileName - Dosya adı
   * @returns Formatlanmış grup adı
   */
  private formatGroupName(fileName: string): string {
    // snake_case'i Title Case'e çevir
    return fileName
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  /**
   * Proje adını çıkarır
   *
   * @param projectPath - Proje dizini
   * @returns Proje adı
   */
  private extractProjectName(projectPath: string): string {
    const dirName = path.basename(projectPath);

    // pyproject.toml veya setup.py'den ad çekmeye çalış
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
      if (nameMatch) {
        return nameMatch[1];
      }
    }

    return dirName;
  }
}

export default FastApiExtractor;
