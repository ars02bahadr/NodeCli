/**
 * Apigen - Ana Orkestratör
 *
 * Bu modül, tüm Apigen pipeline'ını koordine eder:
 * 1. CLI argümanlarını parse eder
 * 2. Config'i yükler
 * 3. Proje tipini algılar (Detector)
 * 4. Uygun Extractor'ü seçer ve çalıştırır
 * 5. Resolver'ları uygular (mock data, auth)
 * 6. Generator'ları çalıştırır
 * 7. İlerleme durumunu gösterir
 *
 * @module core/orchestrator
 */

import * as path from 'path';
import { Command } from 'commander';
import { ConfigLoader, createExampleConfig, validateConfig } from './config';
import { ProjectDetector } from './detector';
import {
  ApiProject,
  ApigenConfig,
  ProjectType,
  ExtractorResult,
  GeneratorResult,
  GeneratorOptions,
  HttpMethod
} from './types';
import { Logger } from '../utils/logger';
import { ensureDir } from '../utils/file-io';

// Extractor imports
import { OpenApiExtractor } from '../extractors/openapi';
import { FastApiExtractor } from '../extractors/python/fastapi';
import { FlaskExtractor } from '../extractors/python/flask';
import { SpringBootExtractor } from '../extractors/java/spring';
import { AspNetExtractor } from '../extractors/dotnet/aspnet';
import { BaseExtractor } from '../extractors/base';

// Generator imports
import { PostmanGenerator } from '../generators/postman';
import { CurlGenerator } from '../generators/curl';
import { ReadmeGenerator } from '../generators/readme';
import { BaseGenerator } from '../generators/base';

// Resolver imports
import { MockDataResolver } from '../resolvers/mock-data';
import { AuthResolver } from '../resolvers/auth';

// ============================================================================
// SABITLER
// ============================================================================

/** Apigen versiyonu */
const VERSION = '1.0.0';

/** ASCII banner */
const BANNER = `
   _    ____ ___ ____ _____ _   _
  / \\  |  _ \\_ _/ ___| ____| \\ | |
 / _ \\ | |_) | | |  _|  _| |  \\| |
/ ___ \\|  __/| | |_| | |___| |\\  |
/_/   \\_\\_|  |___\\____|_____|_| \\_|
                                   v${VERSION}
`;

// ============================================================================
// ORCHESTRATOR SINIFI
// ============================================================================

/**
 * Apigen Orkestratör
 *
 * Tüm pipeline'ı yöneten ana sınıf.
 *
 * @example
 * ```typescript
 * const orchestrator = new Orchestrator();
 * await orchestrator.run(process.argv);
 * ```
 */
export class Orchestrator {
  /** Logger instance */
  private logger: Logger;

  /** Config loader */
  private configLoader: ConfigLoader;

  /** Proje detector */
  private detector: ProjectDetector;

  /** Yüklenen config */
  private config: ApigenConfig | null = null;

  constructor() {
    // Başlangıçta verbose kapalı, config'den sonra güncellenir
    this.logger = new Logger(false);
    this.configLoader = new ConfigLoader(process.cwd(), this.logger);
    this.detector = new ProjectDetector(this.logger);
  }

  /**
   * CLI'ı çalıştırır
   *
   * Commander ile argümanları parse eder ve uygun komutu çalıştırır.
   *
   * @param argv - process.argv
   */
  public async run(argv: string[]): Promise<void> {
    const program = new Command();

    program
      .name('apigen')
      .description('API dokümantasyonu ve test araçları otomatik üretici')
      .version(VERSION, '-v, --version', 'Versiyon numarasını göster');

    // Ana generate komutu (varsayılan)
    program
      .command('generate', { isDefault: true })
      .description('Mevcut dizindeki projeyi analiz et ve çıktıları üret')
      .option('-s, --source <path>', 'Kaynak dosya veya dizin')
      .option('-o, --output <dir>', 'Çıktı dizini')
      .option('-f, --framework <type>', 'Framework tipi (auto, openapi, fastapi, flask, spring, aspnet)')
      .option('--postman', 'Postman collection üret')
      .option('--curl', 'cURL scripts üret')
      .option('--readme', 'README.md üret')
      .option('--all', 'Tüm çıktıları üret')
      .option('--no-mock', 'Mock data üretme')
      .option('--verbose', 'Detaylı log göster')
      .action(async (options) => {
        await this.handleGenerate(options);
      });

    // init komutu
    program
      .command('init')
      .description('apigen.config.json dosyası oluştur')
      .action(async () => {
        await this.handleInit();
      });

    // detect komutu
    program
      .command('detect')
      .description('Proje tipini algıla ve göster')
      .option('-s, --source <path>', 'Kaynak dizin')
      .option('--verbose', 'Detaylı log göster')
      .action(async (options) => {
        await this.handleDetect(options);
      });

    // watch komutu
    program
      .command('watch')
      .description('Dosya değişikliklerini izle ve otomatik yeniden üret')
      .option('-s, --source <path>', 'Kaynak dizin')
      .option('-o, --output <dir>', 'Çıktı dizini')
      .option('--verbose', 'Detaylı log göster')
      .action(async (options) => {
        await this.handleWatch(options);
      });

    // Argümanları parse et ve çalıştır
    await program.parseAsync(argv);
  }

  /**
   * Generate komutunu işler
   *
   * Ana pipeline: Detect → Extract → Resolve → Generate
   */
  private async handleGenerate(options: Record<string, unknown>): Promise<void> {
    console.log(BANNER);

    try {
      // 1. Config'i yükle
      this.config = await this.configLoader.load();
      this.config = this.configLoader.mergeWithCliArgs(this.config, options);

      // Verbose mode'u güncelle
      this.logger = new Logger(this.config.verbose || false);
      this.detector = new ProjectDetector(this.logger);

      const validation = validateConfig(this.config);
      if (!validation.valid) {
        this.logger.error('Konfigürasyon hataları:');
        validation.errors.forEach(err => this.logger.error(`  - ${err}`));
        process.exit(1);
      }

      // Çalışma dizinini göster
      const workingDir = this.config.source === 'auto' ? process.cwd() : this.config.source;
      this.logger.info(`📂 Çalışma dizini: ${workingDir}`);

      // 2. Proje tipini algıla
      this.logger.info('🔍 Proje tipi algılanıyor...');

      let projectType: ProjectType;
      let specFile: string | undefined;

      if (this.config.framework && this.config.framework !== 'auto') {
        // Manuel olarak belirtilmiş
        projectType = this.config.framework as ProjectType;
        this.logger.info(`✓ Kullanılan framework: ${projectType} (manuel)`);

        // OpenAPI için source dosyası kontrol et
        if (projectType === ProjectType.OPENAPI && this.config.source !== 'auto') {
          specFile = this.config.source;
        }
      } else {
        // Otomatik algıla
        const detection = await this.detector.detect(workingDir);

        if (detection.type === ProjectType.UNKNOWN) {
          this.logger.error('❌ Desteklenen proje tipi bulunamadı');
          this.logger.info('Desteklenen tipler: openapi, fastapi, flask, spring, aspnet');
          this.logger.info('İpucu: -f parametresi ile framework tipini belirtebilirsiniz');
          process.exit(1);
        }

        projectType = detection.type;
        specFile = detection.specFile;
        this.logger.success(`✓ Algılanan proje tipi: ${projectType} (güvenilirlik: ${detection.confidence}%)`);

        if (this.config.verbose) {
          detection.reasons.forEach(reason => this.logger.debug(`  - ${reason}`));
        }
      }

      // 3. Extractor'ü seç ve çalıştır
      this.logger.info('📖 Kaynak kodlar taranıyor...');

      const extractor = this.selectExtractor(projectType);
      const extractResult = await extractor.extract(
        specFile || workingDir,
        this.config
      );

      if (!extractResult.success || !extractResult.project) {
        this.logger.error('❌ Kaynak kod analizi başarısız');
        extractResult.errors?.forEach(err => this.logger.error(`  - ${err}`));
        process.exit(1);
      }

      const project = extractResult.project;
      const totalEndpoints = project.groups.reduce(
        (sum, g) => sum + g.endpoints.length, 0
      );

      this.logger.success(`✓ Toplam ${totalEndpoints} endpoint bulundu`);

      // Grup detaylarını göster
      if (this.config.verbose) {
        project.groups.forEach(group => {
          this.logger.debug(`  └─ ${group.name} (${group.endpoints.length} endpoint)`);
        });
      }

      // 4. Resolver'ları uygula
      if (this.config.mockData.enabled) {
        this.logger.info('🎲 Mock data üretiliyor...');

        const mockResolver = new MockDataResolver(
          this.config.mockData.locale,
          this.config.mockData.seed
        );

        await mockResolver.resolve(project);
        this.logger.success(`✓ ${totalEndpoints} endpoint için örnek veri üretildi`);
      }

      // Auth resolver
      if (this.config.auth) {
        const authResolver = new AuthResolver(this.config.auth);
        await authResolver.resolve(project);
      }

      // 5. Generator'ları çalıştır
      this.logger.info('📝 Çıktılar oluşturuluyor...');

      const outputDir = path.resolve(workingDir, this.config.output);
      await ensureDir(outputDir);

      const generatorOptions: GeneratorOptions = {
        outputDir,
        overwrite: true,
        prettyPrint: true,
        includeExamples: true
      };

      const generatedFiles: string[] = [];

      // Postman
      if (this.config.generators.postman) {
        const postmanGen = new PostmanGenerator();
        const result = await postmanGen.generate(project, generatorOptions);

        if (result.success) {
          generatedFiles.push(...result.files);
          this.logger.success(`  ├─ postman_collection.json ✓`);
        } else {
          this.logger.warn(`  ├─ postman_collection.json ✗`);
          result.errors?.forEach(e => this.logger.debug(`    ${e}`));
        }
      }

      // cURL
      if (this.config.generators.curl) {
        const curlGen = new CurlGenerator();
        const result = await curlGen.generate(project, generatorOptions);

        if (result.success) {
          generatedFiles.push(...result.files);
          this.logger.success(`  ├─ curl/ (${result.files.length} dosya) ✓`);
        } else {
          this.logger.warn(`  ├─ curl/ ✗`);
          result.errors?.forEach(e => this.logger.debug(`    ${e}`));
        }
      }

      // README
      if (this.config.generators.readme) {
        const readmeGen = new ReadmeGenerator();
        const result = await readmeGen.generate(project, generatorOptions);

        if (result.success) {
          generatedFiles.push(...result.files);
          this.logger.success(`  └─ README.md ✓`);
        } else {
          this.logger.warn(`  └─ README.md ✗`);
          result.errors?.forEach(e => this.logger.debug(`    ${e}`));
        }
      }

      // Sonuç
      console.log('');
      this.logger.success(`✅ Tamamlandı! Çıktılar: ${outputDir}`);

      // Uyarıları göster
      extractResult.warnings?.forEach(w => this.logger.warn(`⚠️  ${w}`));

    } catch (error) {
      this.logger.error('❌ Beklenmeyen hata:');
      this.logger.error(error instanceof Error ? error.message : String(error));

      if (this.config?.verbose) {
        console.error(error);
      }

      process.exit(1);
    }
  }

  /**
   * Init komutunu işler
   *
   * Örnek config dosyası oluşturur.
   */
  private async handleInit(): Promise<void> {
    const configPath = path.join(process.cwd(), 'apigen.config.json');

    if (createExampleConfig(configPath)) {
      this.logger.success(`✓ Config dosyası oluşturuldu: ${configPath}`);
      this.logger.info('Dosyayı düzenleyerek ayarlarınızı yapılandırabilirsiniz.');
    } else {
      this.logger.error('❌ Config dosyası oluşturulamadı');
      process.exit(1);
    }
  }

  /**
   * Detect komutunu işler
   *
   * Sadece proje tipini algılar ve gösterir.
   */
  private async handleDetect(options: Record<string, unknown>): Promise<void> {
    const verbose = options.verbose as boolean || false;
    this.logger = new Logger(verbose);
    this.detector = new ProjectDetector(this.logger);

    const sourcePath = (options.source as string) || process.cwd();

    this.logger.info(`📂 Dizin: ${sourcePath}`);
    this.logger.info('🔍 Proje tipi algılanıyor...\n');

    const result = await this.detector.detect(sourcePath);

    if (result.type === ProjectType.UNKNOWN) {
      this.logger.warn('Sonuç: Bilinmeyen proje tipi');
      result.reasons.forEach(r => this.logger.info(`  - ${r}`));
    } else {
      this.logger.success(`Sonuç: ${result.type}`);
      this.logger.info(`Güvenilirlik: ${result.confidence}%`);

      if (result.specFile) {
        this.logger.info(`Spec dosyası: ${result.specFile}`);
      }

      if (result.estimatedEndpoints) {
        this.logger.info(`Tahmini endpoint sayısı: ${result.estimatedEndpoints}`);
      }

      if (verbose) {
        this.logger.info('\nAlgılama nedenleri:');
        result.reasons.forEach(r => this.logger.debug(`  - ${r}`));
      }
    }
  }

  /**
   * Watch komutunu işler
   *
   * Dosya değişikliklerini izler ve otomatik yeniden üretir.
   */
  private async handleWatch(options: Record<string, unknown>): Promise<void> {
    const chokidar = await import('chokidar');

    const sourcePath = (options.source as string) || process.cwd();
    const verbose = options.verbose as boolean || false;

    this.logger = new Logger(verbose);

    this.logger.info(`👀 İzleniyor: ${sourcePath}`);
    this.logger.info('Değişiklikler algılandığında otomatik yeniden üretilecek...');
    this.logger.info('Çıkmak için Ctrl+C\n');

    // İzlenecek pattern'ler
    const watchPatterns = [
      '**/*.py',
      '**/*.java',
      '**/*.cs',
      '**/openapi.{json,yaml,yml}',
      '**/swagger.{json,yaml,yml}'
    ];

    // Debounce için timer
    let debounceTimer: NodeJS.Timeout | null = null;

    const watcher = chokidar.watch(watchPatterns, {
      cwd: sourcePath,
      ignored: [
        '**/node_modules/**',
        '**/venv/**',
        '**/.venv/**',
        '**/target/**',
        '**/bin/**',
        '**/obj/**',
        '**/dist/**',
        '**/apigen-output/**'
      ],
      persistent: true,
      ignoreInitial: true
    });

    const triggerRegenerate = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        this.logger.info('\n🔄 Değişiklik algılandı, yeniden üretiliyor...');

        try {
          await this.handleGenerate({
            ...options,
            source: sourcePath
          });
        } catch (error) {
          this.logger.error('Hata oluştu, izleme devam ediyor...');
        }
      }, 500);
    };

    watcher.on('change', (filePath) => {
      this.logger.debug(`Değişti: ${filePath}`);
      triggerRegenerate();
    });

    watcher.on('add', (filePath) => {
      this.logger.debug(`Eklendi: ${filePath}`);
      triggerRegenerate();
    });

    watcher.on('unlink', (filePath) => {
      this.logger.debug(`Silindi: ${filePath}`);
      triggerRegenerate();
    });

    // İlk çalıştırma
    await this.handleGenerate({
      ...options,
      source: sourcePath
    });
  }

  /**
   * Proje tipine göre uygun Extractor'ü seçer
   *
   * @param projectType - Algılanan proje tipi
   * @returns Uygun extractor instance
   */
  private selectExtractor(projectType: ProjectType): BaseExtractor {
    switch (projectType) {
      case ProjectType.OPENAPI:
        return new OpenApiExtractor(this.logger);

      case ProjectType.FASTAPI:
        return new FastApiExtractor(this.logger);

      case ProjectType.FLASK:
        return new FlaskExtractor(this.logger);

      case ProjectType.SPRING_BOOT:
        return new SpringBootExtractor(this.logger);

      case ProjectType.ASPNET_CORE:
        return new AspNetExtractor(this.logger);

      default:
        throw new Error(`Desteklenmeyen proje tipi: ${projectType}`);
    }
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

/**
 * CLI'ı başlatır
 *
 * bin/apigen.js tarafından çağrılır.
 */
export async function main(): Promise<void> {
  const orchestrator = new Orchestrator();
  await orchestrator.run(process.argv);
}

// Doğrudan çalıştırılırsa main'i çağır
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default Orchestrator;
