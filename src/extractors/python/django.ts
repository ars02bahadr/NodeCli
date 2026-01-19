/**
 * Apigen - Django REST Framework Extractor
 *
 * Bu modül, Python Django REST Framework projelerini statik olarak analiz eder.
 * Regex tabanlı "best-effort" analiz yapar.
 *
 * Taranan pattern'ler:
 * - @api_view decorator
 * - ViewSet sınıfları (ModelViewSet, ViewSet, GenericViewSet)
 * - APIView ve GenericAPIView sınıfları
 * - Router registrations
 * - urlpatterns
 * - Serializer sınıfları
 *
 * Sınırlamalar:
 * - Dinamik route'lar tam olarak algılanamayabilir
 * - Class-based view inheritance karmaşık olabilir
 * - Custom router'lar desteklenmez
 *
 * @module extractors/python/django
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
 * @api_view decorator pattern'i
 * @api_view(['GET', 'POST'])
 */
const API_VIEW_DECORATOR_REGEX = /@api_view\s*\(\s*\[([^\]]+)\]\s*\)/gi;

/**
 * ViewSet class pattern'i
 * class UserViewSet(viewsets.ModelViewSet):
 */
const VIEWSET_CLASS_REGEX = /class\s+(\w+)\s*\(\s*(?:viewsets\.)?(ModelViewSet|ViewSet|GenericViewSet|ReadOnlyModelViewSet)\s*\)/gi;

/**
 * APIView class pattern'i
 * class UserDetail(APIView):
 * class UserList(generics.ListCreateAPIView):
 */
const APIVIEW_CLASS_REGEX = /class\s+(\w+)\s*\(\s*(?:generics\.)?(APIView|GenericAPIView|CreateAPIView|ListAPIView|RetrieveAPIView|DestroyAPIView|UpdateAPIView|ListCreateAPIView|RetrieveUpdateAPIView|RetrieveDestroyAPIView|RetrieveUpdateDestroyAPIView)\s*\)/gi;

/**
 * Router register pattern'i
 * router.register(r'users', UserViewSet)
 * router.register('users', UserViewSet, basename='user')
 */
const ROUTER_REGISTER_REGEX = /router\.register\s*\(\s*r?['"]([\w\-\/]+)['"]\s*,\s*(\w+)/gi;

/**
 * URL pattern'i
 * path('users/', UserListView.as_view()),
 * path('users/<int:pk>/', UserDetailView.as_view()),
 */
const URL_PATH_REGEX = /path\s*\(\s*['"]([\w\-\/<>:]+)['"]\s*,\s*(\w+)(?:\.as_view\(\))?/gi;

/**
 * Function-based view def pattern'i
 * def user_list(request):
 */
const FUNCTION_VIEW_REGEX = /def\s+(\w+)\s*\(\s*request/gi;

/**
 * Serializer class pattern'i
 */
const SERIALIZER_CLASS_REGEX = /class\s+(\w+Serializer)\s*\(\s*(?:serializers\.)?(ModelSerializer|Serializer|HyperlinkedModelSerializer)\s*\)/gi;

/**
 * Serializer field pattern'i
 */
const SERIALIZER_FIELD_REGEX = /(\w+)\s*=\s*(?:serializers\.)?(\w+Field)\s*\(/g;

/**
 * Meta class model pattern
 */
const META_MODEL_REGEX = /class\s+Meta\s*:[^}]*model\s*=\s*(\w+)/gi;

/**
 * Meta class fields pattern
 */
const META_FIELDS_REGEX = /fields\s*=\s*(?:\[([^\]]+)\]|['"]__all__['"]|\(([^)]+)\))/i;

// ============================================================================
// TİP DÖNÜŞÜMÜ
// ============================================================================

const DJANGO_FIELD_MAP: Record<string, SchemaType> = {
    'CharField': SchemaType.STRING,
    'TextField': SchemaType.STRING,
    'EmailField': SchemaType.STRING,
    'URLField': SchemaType.STRING,
    'SlugField': SchemaType.STRING,
    'UUIDField': SchemaType.STRING,
    'IntegerField': SchemaType.INTEGER,
    'FloatField': SchemaType.NUMBER,
    'DecimalField': SchemaType.NUMBER,
    'BooleanField': SchemaType.BOOLEAN,
    'DateField': SchemaType.STRING,
    'DateTimeField': SchemaType.STRING,
    'TimeField': SchemaType.STRING,
    'ListField': SchemaType.ARRAY,
    'DictField': SchemaType.OBJECT,
    'JSONField': SchemaType.OBJECT,
    'PrimaryKeyRelatedField': SchemaType.INTEGER,
    'StringRelatedField': SchemaType.STRING,
    'SerializerMethodField': SchemaType.STRING
};

// ============================================================================
// YARDIMCI TİPLER
// ============================================================================

interface ExtractedRoute {
    method: HttpMethod;
    path: string;
    viewName: string;
    viewType: 'function' | 'viewset' | 'apiview';
    filePath: string;
}

interface ExtractedSerializer {
    name: string;
    modelName?: string;
    fields: Array<{ name: string; type: string }>;
    filePath: string;
}

interface ViewSetInfo {
    name: string;
    basePath?: string;
    filePath: string;
}

// ============================================================================
// VIEWSET METOD MAPPING
// ============================================================================

/**
 * ViewSet action'larını HTTP metodlarına mapping
 */
const VIEWSET_ACTIONS: Record<string, { method: HttpMethod; pathSuffix: string }[]> = {
    'ModelViewSet': [
        { method: HttpMethod.GET, pathSuffix: '' },           // list
        { method: HttpMethod.POST, pathSuffix: '' },          // create
        { method: HttpMethod.GET, pathSuffix: '/{id}' },      // retrieve
        { method: HttpMethod.PUT, pathSuffix: '/{id}' },      // update
        { method: HttpMethod.PATCH, pathSuffix: '/{id}' },    // partial_update
        { method: HttpMethod.DELETE, pathSuffix: '/{id}' }    // destroy
    ],
    'ReadOnlyModelViewSet': [
        { method: HttpMethod.GET, pathSuffix: '' },           // list
        { method: HttpMethod.GET, pathSuffix: '/{id}' }       // retrieve
    ],
    'ViewSet': [
        { method: HttpMethod.GET, pathSuffix: '' }            // Varsayılan list
    ],
    'GenericViewSet': [
        { method: HttpMethod.GET, pathSuffix: '' }
    ]
};

/**
 * Generic APIView'ları HTTP metodlarına mapping
 */
const APIVIEW_METHODS: Record<string, HttpMethod[]> = {
    'APIView': [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE],
    'GenericAPIView': [HttpMethod.GET],
    'CreateAPIView': [HttpMethod.POST],
    'ListAPIView': [HttpMethod.GET],
    'RetrieveAPIView': [HttpMethod.GET],
    'DestroyAPIView': [HttpMethod.DELETE],
    'UpdateAPIView': [HttpMethod.PUT, HttpMethod.PATCH],
    'ListCreateAPIView': [HttpMethod.GET, HttpMethod.POST],
    'RetrieveUpdateAPIView': [HttpMethod.GET, HttpMethod.PUT, HttpMethod.PATCH],
    'RetrieveDestroyAPIView': [HttpMethod.GET, HttpMethod.DELETE],
    'RetrieveUpdateDestroyAPIView': [HttpMethod.GET, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE]
};

// ============================================================================
// DJANGO REST FRAMEWORK EXTRACTOR
// ============================================================================

/**
 * Django REST Framework Extractor
 *
 * Python Django REST Framework projelerini regex ile analiz eder.
 */
export class DjangoRestExtractor extends BaseExtractor {
    protected readonly projectType = ProjectType.DJANGO_REST;
    protected readonly name = 'DjangoRestExtractor';

    /** Bulunan serializer'lar */
    private serializers: Map<string, ExtractedSerializer> = new Map();

    /** Bulunan ViewSet'ler */
    private viewSets: Map<string, ViewSetInfo> = new Map();

    /** Router kayıtları */
    private routerRegistrations: Map<string, string> = new Map();

    /**
     * Django REST Framework projesini analiz eder
     */
    public async extract(source: string, config: ApigenConfig): Promise<ExtractorResult> {
        this.info(`Django REST Framework projesi taranıyor: ${source}`);

        this.serializers.clear();
        this.viewSets.clear();
        this.routerRegistrations.clear();

        const warnings: string[] = [];

        try {
            // 1. Python dosyalarını bul
            const pyFiles = await this.findPythonFiles(source);

            if (pyFiles.length === 0) {
                return this.createErrorResult(['Python dosyası bulunamadı']);
            }

            this.debug(`${pyFiles.length} Python dosyası bulundu`);

            // 2. İlk geçişte serializer'ları ve viewset tanımlarını çıkar
            for (const pyFile of pyFiles) {
                const filePath = path.join(source, pyFile);
                const content = fs.readFileSync(filePath, 'utf-8');

                this.extractSerializers(content, filePath);
                this.extractViewSetDefinitions(content, filePath);
                this.extractRouterRegistrations(content, filePath);
            }

            // 3. İkinci geçişte endpoint'leri çıkar
            const allRoutes: ExtractedRoute[] = [];

            for (const pyFile of pyFiles) {
                const filePath = path.join(source, pyFile);
                const content = fs.readFileSync(filePath, 'utf-8');

                const routes = this.extractRoutes(content, filePath);
                allRoutes.push(...routes);
            }

            // ViewSet registration'larından endpoint'ler oluştur
            const viewSetRoutes = this.generateViewSetRoutes();
            allRoutes.push(...viewSetRoutes);

            if (allRoutes.length === 0) {
                return this.createErrorResult([
                    'Django REST Framework endpoint bulunamadı',
                    'İpucu: @api_view, ViewSet, APIView gibi pattern\'lar aranıyor'
                ]);
            }

            // 4. Proje oluştur
            const project = this.createEmptyProject(source, config);
            project.info.title = this.extractProjectName(source);

            // 5. Route'ları endpoint'lere dönüştür
            const endpoints = allRoutes.map(route => this.routeToEndpoint(route));

            // 6. View bazlı gruplama
            project.groups = this.groupEndpointsByView(endpoints, allRoutes);

            this.info(`${endpoints.length} endpoint başarıyla çıkarıldı`);

            warnings.push('Django REST Framework extractor experimental\'dir. Tüm endpoint\'ler algılanmamış olabilir.');

            return this.createSuccessResult(project, pyFiles.length, warnings);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.error(`Parse hatası: ${errorMessage}`);

            return this.createErrorResult([`Django REST Framework parse hatası: ${errorMessage}`]);
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
                '**/migrations/**',
                '**/tests/**',
                '**/test_*.py',
                '**/*_test.py'
            ]
        });

        return files;
    }

    /**
     * Serializer sınıflarını çıkarır
     */
    private extractSerializers(content: string, filePath: string): void {
        const regex = new RegExp(SERIALIZER_CLASS_REGEX.source, 'gi');
        let match;

        while ((match = regex.exec(content)) !== null) {
            const className = match[1];

            // Serializer içeriğini bul
            const classStartIndex = match.index;
            const classContent = this.extractClassBody(content, classStartIndex);

            const fields = this.extractSerializerFields(classContent);
            const modelName = this.extractMetaModel(classContent);

            this.serializers.set(className, {
                name: className,
                modelName,
                fields,
                filePath
            });

            this.debug(`Serializer bulundu: ${className} (${fields.length} field)`);
        }
    }

    /**
     * Serializer field'larını çıkarır
     */
    private extractSerializerFields(classContent: string): Array<{ name: string; type: string }> {
        const fields: Array<{ name: string; type: string }> = [];
        const regex = new RegExp(SERIALIZER_FIELD_REGEX.source, 'g');
        let match;

        while ((match = regex.exec(classContent)) !== null) {
            const fieldName = match[1];
            const fieldType = match[2];

            fields.push({ name: fieldName, type: fieldType });
        }

        // Meta class'tan fields çıkar
        const metaFieldsMatch = classContent.match(META_FIELDS_REGEX);
        if (metaFieldsMatch) {
            const fieldsStr = metaFieldsMatch[1] || metaFieldsMatch[2];
            if (fieldsStr) {
                const fieldNames = fieldsStr.split(',').map(f => f.trim().replace(/['"]/g, ''));
                for (const fieldName of fieldNames) {
                    if (fieldName && !fields.find(f => f.name === fieldName)) {
                        fields.push({ name: fieldName, type: 'CharField' }); // Varsayılan tip
                    }
                }
            }
        }

        return fields;
    }

    /**
     * Meta class'tan model adını çıkarır
     */
    private extractMetaModel(classContent: string): string | undefined {
        const match = classContent.match(/model\s*=\s*(\w+)/);
        return match ? match[1] : undefined;
    }

    /**
     * Class body'sini çıkarır (basit indentation-based)
     */
    private extractClassBody(content: string, startIndex: number): string {
        const lines = content.slice(startIndex).split('\n');
        let body = lines[0] + '\n';
        let baseIndent = -1;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed === '') {
                body += line + '\n';
                continue;
            }

            const indent = line.search(/\S/);

            if (baseIndent === -1) {
                baseIndent = indent;
            }

            if (indent >= baseIndent) {
                body += line + '\n';
            } else if (trimmed.startsWith('class ') || trimmed.startsWith('def ')) {
                break;
            }
        }

        return body;
    }

    /**
     * ViewSet tanımlarını çıkarır
     */
    private extractViewSetDefinitions(content: string, filePath: string): void {
        const regex = new RegExp(VIEWSET_CLASS_REGEX.source, 'gi');
        let match;

        while ((match = regex.exec(content)) !== null) {
            const className = match[1];
            const baseClass = match[2];

            this.viewSets.set(className, {
                name: className,
                filePath
            });

            this.debug(`ViewSet bulundu: ${className} (${baseClass})`);
        }
    }

    /**
     * Router registration'larını çıkarır
     */
    private extractRouterRegistrations(content: string, filePath: string): void {
        const regex = new RegExp(ROUTER_REGISTER_REGEX.source, 'gi');
        let match;

        while ((match = regex.exec(content)) !== null) {
            const urlPrefix = match[1];
            const viewSetName = match[2];

            this.routerRegistrations.set(viewSetName, urlPrefix);
            this.debug(`Router registration bulundu: ${urlPrefix} -> ${viewSetName}`);
        }
    }

    /**
     * Endpoint'leri çıkarır
     */
    private extractRoutes(content: string, filePath: string): ExtractedRoute[] {
        const routes: ExtractedRoute[] = [];

        // @api_view decorator'lı function-based view'lar
        const apiViewRegex = new RegExp(API_VIEW_DECORATOR_REGEX.source, 'gi');
        let match;

        while ((match = apiViewRegex.exec(content)) !== null) {
            const methodsStr = match[1];
            const methods = methodsStr.split(',').map(m => m.trim().replace(/['"]/g, '').toUpperCase());

            // Sonraki function tanımını bul
            const afterDecorator = content.slice(match.index + match[0].length);
            const funcMatch = afterDecorator.match(/def\s+(\w+)\s*\(/);

            if (funcMatch) {
                const funcName = funcMatch[1];

                for (const method of methods) {
                    const httpMethod = this.parseHttpMethod(method);
                    if (httpMethod) {
                        routes.push({
                            method: httpMethod,
                            path: `/${this.camelToSnake(funcName).replace(/_/g, '-')}`,
                            viewName: funcName,
                            viewType: 'function',
                            filePath
                        });
                    }
                }
            }
        }

        // URL path pattern'leri
        const urlPathRegex = new RegExp(URL_PATH_REGEX.source, 'gi');
        while ((match = urlPathRegex.exec(content)) !== null) {
            const urlPath = match[1];
            const viewName = match[2];

            // Path'i normalize et
            const normalizedPath = '/' + urlPath.replace(/<(\w+):(\w+)>/g, '{$2}').replace(/<(\w+)>/g, '{$1}');

            // View tipini belirle (ViewSet mi, APIView mi?)
            const viewSetInfo = this.viewSets.get(viewName);

            if (!viewSetInfo) {
                // APIView veya function-based olabilir
                routes.push({
                    method: HttpMethod.GET,
                    path: normalizedPath,
                    viewName,
                    viewType: 'apiview',
                    filePath
                });
            }
        }

        return routes;
    }

    /**
     * ViewSet registration'larından route'lar oluşturur
     */
    private generateViewSetRoutes(): ExtractedRoute[] {
        const routes: ExtractedRoute[] = [];

        for (const [viewSetName, urlPrefix] of this.routerRegistrations) {
            const viewSetInfo = this.viewSets.get(viewSetName);
            if (!viewSetInfo) continue;

            // ViewSet tipine göre action'ları belirle
            // Varsayılan olarak ModelViewSet kabul ediyoruz
            const actions = VIEWSET_ACTIONS['ModelViewSet'];

            for (const action of actions) {
                routes.push({
                    method: action.method,
                    path: `/api/${urlPrefix}${action.pathSuffix}`,
                    viewName: viewSetName,
                    viewType: 'viewset',
                    filePath: viewSetInfo.filePath
                });
            }
        }

        return routes;
    }

    /**
     * Route'u endpoint'e dönüştürür
     */
    private routeToEndpoint(route: ExtractedRoute): ApiEndpoint {
        const parameters: ApiParameter[] = [];
        let requestBody: ApiRequestBody | undefined;

        // Path parametrelerini çıkar
        const pathParams = this.extractPathParams(route.path);
        for (const paramName of pathParams) {
            parameters.push({
                name: paramName,
                in: ParameterLocation.PATH,
                required: true,
                schema: { type: paramName === 'id' || paramName === 'pk' ? SchemaType.INTEGER : SchemaType.STRING }
            });
        }

        // POST, PUT, PATCH için request body ekle
        if ([HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH].includes(route.method)) {
            // İlgili serializer'ı bul
            const serializerName = route.viewName.replace(/ViewSet$/, 'Serializer')
                .replace(/View$/, 'Serializer');

            const serializer = this.serializers.get(serializerName);

            if (serializer) {
                requestBody = {
                    required: true,
                    contentType: 'application/json',
                    schema: this.serializerToSchema(serializer)
                };
            } else {
                requestBody = {
                    required: true,
                    contentType: 'application/json',
                    schema: { type: SchemaType.OBJECT }
                };
            }
        }

        return {
            method: route.method,
            path: this.normalizePath(route.path),
            summary: this.generateSummary(route.viewName, route.method),
            operationId: `${route.viewName}_${route.method.toLowerCase()}`,
            parameters,
            requestBody,
            responses: [
                this.createDefaultResponse(route.method === HttpMethod.POST ? 201 : 200, 'Successful Response')
            ]
        };
    }

    /**
     * Serializer'ı ApiSchema'ya dönüştürür
     */
    private serializerToSchema(serializer: ExtractedSerializer): ApiSchema {
        const properties: Record<string, ApiSchema> = {};

        for (const field of serializer.fields) {
            properties[field.name] = {
                type: DJANGO_FIELD_MAP[field.type] || SchemaType.STRING
            };
        }

        return {
            type: SchemaType.OBJECT,
            properties
        };
    }

    /**
     * Özet oluşturur
     */
    private generateSummary(viewName: string, method: HttpMethod): string {
        const cleanName = viewName.replace(/ViewSet$/, '').replace(/View$/, '');
        const words = cleanName.replace(/([A-Z])/g, ' $1').trim();

        const methodActions: Record<HttpMethod, string> = {
            [HttpMethod.GET]: 'Get',
            [HttpMethod.POST]: 'Create',
            [HttpMethod.PUT]: 'Update',
            [HttpMethod.PATCH]: 'Partial Update',
            [HttpMethod.DELETE]: 'Delete',
            [HttpMethod.OPTIONS]: 'Options',
            [HttpMethod.HEAD]: 'Head'
        };

        return `${methodActions[method]} ${words}`;
    }

    /**
     * camelCase'i snake_case'e çevirir
     */
    private camelToSnake(str: string): string {
        return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    }

    /**
     * Endpoint'leri view bazlı gruplar
     */
    private groupEndpointsByView(
        endpoints: ApiEndpoint[],
        routes: ExtractedRoute[]
    ): { name: string; endpoints: ApiEndpoint[] }[] {
        const groups = new Map<string, ApiEndpoint[]>();

        for (let i = 0; i < endpoints.length; i++) {
            const route = routes[i];
            const groupName = route.viewName.replace(/ViewSet$/, '').replace(/View$/, '');

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
        // settings.py'den proje adını çek
        const settingsPath = path.join(projectPath, 'settings.py');
        if (fs.existsSync(settingsPath)) {
            const content = fs.readFileSync(settingsPath, 'utf-8');
            const match = content.match(/ROOT_URLCONF\s*=\s*['"]([\w.]+)['"]/);
            if (match) {
                return match[1].split('.')[0];
            }
        }

        // manage.py varsa proje adını oradan çek
        const managePath = path.join(projectPath, 'manage.py');
        if (fs.existsSync(managePath)) {
            const content = fs.readFileSync(managePath, 'utf-8');
            const match = content.match(/DJANGO_SETTINGS_MODULE.*?['"]([\w.]+)['"]/);
            if (match) {
                return match[1].split('.')[0];
            }
        }

        return path.basename(projectPath);
    }
}

export default DjangoRestExtractor;
