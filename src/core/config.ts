/**
 * Apigen - Konfigürasyon Yöneticisi
 *
 * Bu modül, CLI konfigürasyonunu yönetir:
 * 1. apigen.config.json dosyasını okur (varsa)
 * 2. Varsayılan değerlerle birleştirir
 * 3. CLI argümanlarını config ile merge eder
 * 4. Environment variable'ları destekler
 *
 * Öncelik sırası (yüksekten düşüğe):
 * CLI argümanları > Environment variables > Config dosyası > Varsayılanlar
 *
 * @module core/config
 */

import * as fs from 'fs';
import * as path from 'path';
import { ApigenConfig, AuthType, ProjectType } from './types';
import { Logger } from '../utils/logger';

// ============================================================================
// VARSAYILAN DEĞERLER
// ============================================================================

/**
 * Varsayılan konfigürasyon değerleri
 *
 * Config dosyası bulunamazsa veya eksik alanlar varsa bu değerler kullanılır.
 */
const DEFAULT_CONFIG: ApigenConfig = {
  // Kaynak otomatik algılanır (mevcut dizin)
  source: 'auto',

  // Çıktı dizini - mevcut dizin altında
  output: './apigen-output',

  // Varsayılan base URL (placeholder)
  baseUrl: 'http://localhost:3000',

  // Varsayılan auth ayarları
  auth: {
    type: AuthType.BEARER,
    tokenPlaceholder: '{{token}}'
  },

  // Tüm generator'lar aktif
  generators: {
    postman: true,
    curl: true,
    readme: true
  },

  // Mock data ayarları
  mockData: {
    enabled: true,
    locale: 'tr',      // Türkçe locale varsayılan
    seed: undefined    // Her çalışmada farklı data
  },

  // Framework otomatik algılanır
  framework: 'auto',

  // Varsayılan olarak verbose kapalı
  verbose: false
};

/**
 * Config dosyası adı
 *
 * Bu isimde bir dosya aranır (mevcut dizinde veya üst dizinlerde).
 */
const CONFIG_FILE_NAME = 'apigen.config.json';

/**
 * Environment variable prefix'i
 *
 * APIGEN_ ile başlayan env var'lar config değerlerini override eder.
 */
const ENV_PREFIX = 'APIGEN_';

// ============================================================================
// CONFIG LOADER SINIFI
// ============================================================================

/**
 * Konfigürasyon Yükleyici
 *
 * Config dosyasını bulur, okur ve merge işlemlerini yapar.
 *
 * @example
 * ```typescript
 * const loader = new ConfigLoader('/path/to/project');
 * const config = await loader.load();
 *
 * // CLI argümanlarını merge et
 * const finalConfig = loader.mergeWithCliArgs(config, { verbose: true });
 * ```
 */
export class ConfigLoader {
  /** Proje kök dizini (config dosyasının aranacağı yer) */
  private readonly rootDir: string;

  /** Logger instance */
  private readonly logger: Logger;

  /**
   * ConfigLoader constructor
   *
   * @param rootDir - Proje kök dizini (varsayılan: process.cwd())
   * @param logger - Logger instance (opsiyonel)
   */
  constructor(rootDir?: string, logger?: Logger) {
    this.rootDir = rootDir || process.cwd();
    this.logger = logger || new Logger(false);
  }

  /**
   * Konfigürasyonu yükler
   *
   * Config dosyasını arar, bulursa okur ve varsayılanlarla merge eder.
   * Environment variable'ları da uygular.
   *
   * @returns Merge edilmiş konfigürasyon
   */
  public async load(): Promise<ApigenConfig> {
    // 1. Varsayılan config ile başla
    let config: ApigenConfig = { ...DEFAULT_CONFIG };

    // 2. Config dosyasını bul ve oku
    const configPath = this.findConfigFile();
    if (configPath) {
      this.logger.debug(`Config dosyası bulundu: ${configPath}`);
      const fileConfig = await this.readConfigFile(configPath);
      if (fileConfig) {
        // Deep merge yap
        config = this.deepMerge(config, fileConfig);
      }
    } else {
      this.logger.debug('Config dosyası bulunamadı, varsayılanlar kullanılıyor');
    }

    // 3. Environment variable'ları uygula
    config = this.applyEnvironmentVariables(config);

    return config;
  }

  /**
   * CLI argümanlarını config ile birleştirir
   *
   * CLI argümanları en yüksek önceliğe sahiptir.
   * Undefined olan argümanlar mevcut config'i değiştirmez.
   *
   * @param config - Mevcut konfigürasyon
   * @param args - CLI argümanları
   * @returns Birleştirilmiş konfigürasyon
   */
  public mergeWithCliArgs(
    config: ApigenConfig,
    args: {
      source?: string;
      output?: string;
      framework?: string;
      postman?: boolean;
      curl?: boolean;
      readme?: boolean;
      all?: boolean;
      noMock?: boolean;
      verbose?: boolean;
    }
  ): ApigenConfig {
    // Shallow copy oluştur
    const result: ApigenConfig = { ...config };

    // Basit alanları merge et
    if (args.source !== undefined) {
      result.source = args.source;
    }

    if (args.output !== undefined) {
      result.output = args.output;
    }

    if (args.framework !== undefined) {
      result.framework = args.framework as ProjectType | 'auto';
    }

    if (args.verbose !== undefined) {
      result.verbose = args.verbose;
    }

    // Generator flags'leri işle
    // --all flag'i varsa hepsini aç
    if (args.all) {
      result.generators = {
        postman: true,
        curl: true,
        readme: true
      };
    } else {
      // Bireysel flag'ler belirtilmişse sadece onları aç
      const hasAnyGeneratorFlag =
        args.postman !== undefined ||
        args.curl !== undefined ||
        args.readme !== undefined;

      if (hasAnyGeneratorFlag) {
        result.generators = {
          postman: args.postman ?? false,
          curl: args.curl ?? false,
          readme: args.readme ?? false
        };
      }
    }

    // Mock data flag'i
    if (args.noMock) {
      result.mockData = {
        ...result.mockData,
        enabled: false
      };
    }

    return result;
  }

  /**
   * Config dosyasını bulur
   *
   * Mevcut dizinden başlayarak üst dizinlere doğru arar.
   * Node.js'in package.json aramasına benzer davranış.
   *
   * @returns Config dosyası yolu veya null
   */
  private findConfigFile(): string | null {
    let currentDir = this.rootDir;
    const root = path.parse(currentDir).root;

    // Kök dizine ulaşana kadar ara
    while (currentDir !== root) {
      const configPath = path.join(currentDir, CONFIG_FILE_NAME);

      if (fs.existsSync(configPath)) {
        return configPath;
      }

      // Bir üst dizine çık
      currentDir = path.dirname(currentDir);
    }

    // Kök dizinde de kontrol et
    const rootConfigPath = path.join(root, CONFIG_FILE_NAME);
    if (fs.existsSync(rootConfigPath)) {
      return rootConfigPath;
    }

    return null;
  }

  /**
   * Config dosyasını okur ve parse eder
   *
   * JSON formatında olmalıdır. Hatalı format durumunda
   * uyarı verir ve null döner.
   *
   * @param filePath - Config dosyası yolu
   * @returns Parse edilmiş config veya null
   */
  private async readConfigFile(filePath: string): Promise<Partial<ApigenConfig> | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<ApigenConfig>;

      // Basit validasyon
      if (typeof parsed !== 'object' || parsed === null) {
        this.logger.warn(`Config dosyası geçersiz format: ${filePath}`);
        return null;
      }

      return parsed;
    } catch (error) {
      // JSON parse hatası
      if (error instanceof SyntaxError) {
        this.logger.warn(`Config dosyası JSON parse hatası: ${filePath}`);
        this.logger.debug(`Hata detayı: ${error.message}`);
      } else {
        this.logger.warn(`Config dosyası okunamadı: ${filePath}`);
      }
      return null;
    }
  }

  /**
   * Environment variable'ları config'e uygular
   *
   * APIGEN_ prefix'i ile başlayan env var'lar işlenir:
   * - APIGEN_BASE_URL -> config.baseUrl
   * - APIGEN_OUTPUT -> config.output
   * - APIGEN_VERBOSE -> config.verbose (true/false)
   * - APIGEN_MOCK_LOCALE -> config.mockData.locale
   *
   * @param config - Mevcut konfigürasyon
   * @returns Güncellenmiş konfigürasyon
   */
  private applyEnvironmentVariables(config: ApigenConfig): ApigenConfig {
    const result = { ...config };

    // APIGEN_BASE_URL
    const baseUrl = process.env[`${ENV_PREFIX}BASE_URL`];
    if (baseUrl) {
      result.baseUrl = baseUrl;
      this.logger.debug(`ENV: baseUrl = ${baseUrl}`);
    }

    // APIGEN_OUTPUT
    const output = process.env[`${ENV_PREFIX}OUTPUT`];
    if (output) {
      result.output = output;
      this.logger.debug(`ENV: output = ${output}`);
    }

    // APIGEN_VERBOSE
    const verbose = process.env[`${ENV_PREFIX}VERBOSE`];
    if (verbose !== undefined) {
      result.verbose = verbose.toLowerCase() === 'true';
      this.logger.debug(`ENV: verbose = ${result.verbose}`);
    }

    // APIGEN_MOCK_LOCALE
    const locale = process.env[`${ENV_PREFIX}MOCK_LOCALE`];
    if (locale) {
      result.mockData = {
        ...result.mockData,
        locale
      };
      this.logger.debug(`ENV: mockData.locale = ${locale}`);
    }

    // APIGEN_MOCK_SEED
    const seed = process.env[`${ENV_PREFIX}MOCK_SEED`];
    if (seed) {
      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum)) {
        result.mockData = {
          ...result.mockData,
          seed: seedNum
        };
        this.logger.debug(`ENV: mockData.seed = ${seedNum}`);
      }
    }

    // APIGEN_AUTH_TYPE
    const authType = process.env[`${ENV_PREFIX}AUTH_TYPE`];
    if (authType && Object.values(AuthType).includes(authType as AuthType)) {
      result.auth = {
        ...result.auth!,
        type: authType as AuthType
      };
      this.logger.debug(`ENV: auth.type = ${authType}`);
    }

    // APIGEN_TOKEN (token placeholder değil, gerçek token - CI/CD için)
    // Bu değer config'e yazılmaz ama runtime'da kullanılabilir
    const token = process.env[`${ENV_PREFIX}TOKEN`];
    if (token) {
      this.logger.debug('ENV: Token değeri algılandı (gizli)');
    }

    return result;
  }

  /**
   * İki objeyi deep merge eder
   *
   * Source objesi target'ı override eder.
   * Nested objeler recursive merge edilir.
   *
   * @param target - Hedef obje
   * @param source - Kaynak obje (override eden)
   * @returns Merge edilmiş obje
   */
  private deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key of Object.keys(source) as Array<keyof T>) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== undefined &&
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        // Nested object - recursive merge
        result[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[keyof T];
      } else if (sourceValue !== undefined) {
        // Primitive veya array - direct assign
        result[key] = sourceValue as T[keyof T];
      }
    }

    return result;
  }
}

// ============================================================================
// YARDIMCI FONKSİYONLAR
// ============================================================================

/**
 * Varsayılan config'i döndürür
 *
 * Unit testler ve hızlı başlangıç için kullanışlı.
 *
 * @returns Varsayılan ApigenConfig
 */
export function getDefaultConfig(): ApigenConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Config'i doğrular
 *
 * Zorunlu alanların varlığını ve değerlerin geçerliliğini kontrol eder.
 *
 * @param config - Doğrulanacak config
 * @returns Doğrulama sonucu { valid: boolean, errors: string[] }
 */
export function validateConfig(config: ApigenConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Zorunlu alanlar
  if (!config.source) {
    errors.push('source alanı zorunludur');
  }

  if (!config.output) {
    errors.push('output alanı zorunludur');
  }

  if (!config.baseUrl) {
    errors.push('baseUrl alanı zorunludur');
  }

  // URL formatı kontrolü (basit)
  if (config.baseUrl && !isValidUrl(config.baseUrl)) {
    // Placeholder'lar ({{...}}) kabul edilir
    if (!config.baseUrl.includes('{{')) {
      errors.push('baseUrl geçerli bir URL formatında olmalıdır');
    }
  }

  // Generator kontrolü - en az biri aktif olmalı
  if (
    config.generators &&
    !config.generators.postman &&
    !config.generators.curl &&
    !config.generators.readme
  ) {
    errors.push('En az bir generator aktif olmalıdır');
  }

  // Auth type kontrolü
  if (config.auth && !Object.values(AuthType).includes(config.auth.type)) {
    errors.push(`Geçersiz auth type: ${config.auth.type}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Basit URL validasyonu
 *
 * @param url - Kontrol edilecek URL
 * @returns Geçerli URL ise true
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Örnek config dosyası oluşturur
 *
 * `apigen init` komutu tarafından kullanılır.
 *
 * @param targetPath - Hedef dosya yolu
 * @returns Başarılı ise true
 */
export function createExampleConfig(targetPath: string): boolean {
  const exampleConfig = {
    source: 'auto',
    output: './apigen-output',
    baseUrl: 'http://localhost:3000',
    auth: {
      type: 'bearer',
      tokenPlaceholder: '{{token}}'
    },
    generators: {
      postman: true,
      curl: true,
      readme: true
    },
    mockData: {
      enabled: true,
      locale: 'tr',
      seed: 12345
    }
  };

  try {
    const content = JSON.stringify(exampleConfig, null, 2);
    fs.writeFileSync(targetPath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// Default export olarak ConfigLoader
export default ConfigLoader;
