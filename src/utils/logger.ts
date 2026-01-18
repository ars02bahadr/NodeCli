/**
 * Apigen - Renkli Console Logger
 *
 * Bu modül, CLI çıktıları için renkli ve formatlanmış loglama sağlar.
 * Chalk kütüphanesi ile renkli output, ora ile spinner desteği sunar.
 *
 * Log seviyeleri:
 * - debug: Sadece verbose modda görünür (gri)
 * - info: Normal bilgi mesajları (mavi)
 * - success: Başarılı işlemler (yeşil)
 * - warn: Uyarılar (sarı)
 * - error: Hatalar (kırmızı)
 *
 * @module utils/logger
 */

import chalk from 'chalk';
import ora, { Ora } from 'ora';

// ============================================================================
// LOG SEVİYELERİ
// ============================================================================

/**
 * Log seviyesi enum'u
 *
 * Sayısal değerler filtreleme için kullanılır.
 * Düşük değer = daha detaylı log.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  SUCCESS = 2,
  WARN = 3,
  ERROR = 4,
  SILENT = 5
}

// ============================================================================
// LOGGER SINIFI
// ============================================================================

/**
 * Renkli Console Logger
 *
 * CLI için özelleştirilmiş loglama sınıfı.
 *
 * @example
 * ```typescript
 * const logger = new Logger(true); // verbose mode
 *
 * logger.info('İşlem başlıyor...');
 * logger.success('Tamamlandı!');
 * logger.warn('Dikkat: Eksik alan var');
 * logger.error('Hata oluştu');
 * logger.debug('Detaylı bilgi'); // Sadece verbose modda görünür
 *
 * // Spinner kullanımı
 * const spinner = logger.startSpinner('Yükleniyor...');
 * // ... işlem ...
 * spinner.succeed('Yüklendi!');
 * ```
 */
export class Logger {
  /** Verbose mod aktif mi? */
  private readonly verbose: boolean;

  /** Minimum log seviyesi */
  private readonly minLevel: LogLevel;

  /** Aktif spinner (varsa) */
  private activeSpinner: Ora | null = null;

  /**
   * Logger constructor
   *
   * @param verbose - Verbose mod (debug mesajları gösterilir)
   * @param minLevel - Minimum log seviyesi (opsiyonel)
   */
  constructor(verbose: boolean = false, minLevel?: LogLevel) {
    this.verbose = verbose;
    this.minLevel = minLevel ?? (verbose ? LogLevel.DEBUG : LogLevel.INFO);
  }

  /**
   * Debug seviyesinde log
   *
   * Sadece verbose modda görünür.
   * Gri renkte, girintili format.
   *
   * @param message - Log mesajı
   * @param args - Ek argümanlar
   */
  public debug(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.DEBUG) {
      this.pauseSpinner();
      console.log(chalk.gray(`  ${message}`), ...args);
      this.resumeSpinner();
    }
  }

  /**
   * Info seviyesinde log
   *
   * Normal bilgi mesajları için.
   * Mavi renkte.
   *
   * @param message - Log mesajı
   * @param args - Ek argümanlar
   */
  public info(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.INFO) {
      this.pauseSpinner();
      console.log(chalk.blue(message), ...args);
      this.resumeSpinner();
    }
  }

  /**
   * Success seviyesinde log
   *
   * Başarılı işlemler için.
   * Yeşil renkte.
   *
   * @param message - Log mesajı
   * @param args - Ek argümanlar
   */
  public success(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.SUCCESS) {
      this.pauseSpinner();
      console.log(chalk.green(message), ...args);
      this.resumeSpinner();
    }
  }

  /**
   * Warn seviyesinde log
   *
   * Uyarılar için.
   * Sarı renkte.
   *
   * @param message - Log mesajı
   * @param args - Ek argümanlar
   */
  public warn(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.WARN) {
      this.pauseSpinner();
      console.log(chalk.yellow(message), ...args);
      this.resumeSpinner();
    }
  }

  /**
   * Error seviyesinde log
   *
   * Hatalar için.
   * Kırmızı renkte.
   *
   * @param message - Log mesajı
   * @param args - Ek argümanlar
   */
  public error(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.ERROR) {
      this.pauseSpinner();
      console.error(chalk.red(message), ...args);
      this.resumeSpinner();
    }
  }

  /**
   * Boş satır yazdırır
   */
  public newLine(): void {
    this.pauseSpinner();
    console.log('');
    this.resumeSpinner();
  }

  /**
   * Ayırıcı çizgi yazdırır
   *
   * @param char - Çizgi karakteri (varsayılan: ─)
   * @param length - Çizgi uzunluğu (varsayılan: 50)
   */
  public separator(char: string = '─', length: number = 50): void {
    this.pauseSpinner();
    console.log(chalk.gray(char.repeat(length)));
    this.resumeSpinner();
  }

  /**
   * Spinner başlatır
   *
   * Uzun süren işlemler için animasyonlu gösterge.
   *
   * @param message - Spinner mesajı
   * @returns Ora spinner instance
   *
   * @example
   * ```typescript
   * const spinner = logger.startSpinner('API analiz ediliyor...');
   * // ... işlem ...
   * spinner.succeed('Analiz tamamlandı!');
   * // veya
   * spinner.fail('Analiz başarısız!');
   * ```
   */
  public startSpinner(message: string): Ora {
    // Önceki spinner varsa durdur
    if (this.activeSpinner) {
      this.activeSpinner.stop();
    }

    this.activeSpinner = ora({
      text: message,
      color: 'cyan',
      spinner: 'dots'
    }).start();

    return this.activeSpinner;
  }

  /**
   * Aktif spinner'ı günceller
   *
   * @param message - Yeni mesaj
   */
  public updateSpinner(message: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.text = message;
    }
  }

  /**
   * Aktif spinner'ı başarılı olarak bitirir
   *
   * @param message - Başarı mesajı (opsiyonel)
   */
  public succeedSpinner(message?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.succeed(message);
      this.activeSpinner = null;
    }
  }

  /**
   * Aktif spinner'ı hatalı olarak bitirir
   *
   * @param message - Hata mesajı (opsiyonel)
   */
  public failSpinner(message?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.fail(message);
      this.activeSpinner = null;
    }
  }

  /**
   * Aktif spinner'ı uyarı ile bitirir
   *
   * @param message - Uyarı mesajı (opsiyonel)
   */
  public warnSpinner(message?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.warn(message);
      this.activeSpinner = null;
    }
  }

  /**
   * Aktif spinner'ı durdurur (geçici)
   *
   * Log yazdırırken spinner'ın çakışmaması için.
   */
  private pauseSpinner(): void {
    if (this.activeSpinner && this.activeSpinner.isSpinning) {
      this.activeSpinner.stop();
    }
  }

  /**
   * Durdurulan spinner'ı devam ettirir
   */
  private resumeSpinner(): void {
    if (this.activeSpinner) {
      this.activeSpinner.start();
    }
  }

  /**
   * Tablo formatında veri yazdırır
   *
   * @param headers - Tablo başlıkları
   * @param rows - Tablo satırları
   *
   * @example
   * ```typescript
   * logger.table(
   *   ['Method', 'Path', 'Description'],
   *   [
   *     ['GET', '/users', 'List users'],
   *     ['POST', '/users', 'Create user']
   *   ]
   * );
   * ```
   */
  public table(headers: string[], rows: string[][]): void {
    this.pauseSpinner();

    // Sütun genişliklerini hesapla
    const colWidths = headers.map((h, i) => {
      const maxRowWidth = Math.max(...rows.map(r => (r[i] || '').length));
      return Math.max(h.length, maxRowWidth);
    });

    // Başlık satırı
    const headerRow = headers
      .map((h, i) => h.padEnd(colWidths[i]))
      .join(' │ ');
    console.log(chalk.bold(headerRow));

    // Ayırıcı
    const separator = colWidths.map(w => '─'.repeat(w)).join('─┼─');
    console.log(chalk.gray(separator));

    // Veri satırları
    for (const row of rows) {
      const dataRow = row
        .map((cell, i) => (cell || '').padEnd(colWidths[i]))
        .join(' │ ');
      console.log(dataRow);
    }

    this.resumeSpinner();
  }

  /**
   * İlerleme çubuğu gösterir
   *
   * @param current - Mevcut değer
   * @param total - Toplam değer
   * @param message - İlerleme mesajı
   * @param width - Çubuk genişliği (varsayılan: 30)
   *
   * @example
   * ```typescript
   * for (let i = 0; i <= 100; i += 10) {
   *   logger.progress(i, 100, 'İşleniyor...');
   * }
   * ```
   */
  public progress(current: number, total: number, message: string, width: number = 30): void {
    this.pauseSpinner();

    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;

    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    const percentStr = `${percentage}%`.padStart(4);

    // Aynı satırda güncelle
    process.stdout.write(`\r${bar} ${percentStr} ${message}`);

    // Tamamlandıysa yeni satır
    if (current >= total) {
      console.log('');
    }

    this.resumeSpinner();
  }

  /**
   * Kutu içinde mesaj gösterir
   *
   * @param message - Mesaj
   * @param type - Kutu tipi (info, success, warn, error)
   */
  public box(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info'): void {
    this.pauseSpinner();

    const colors = {
      info: chalk.blue,
      success: chalk.green,
      warn: chalk.yellow,
      error: chalk.red
    };

    const color = colors[type];
    const width = message.length + 4;

    console.log(color('┌' + '─'.repeat(width - 2) + '┐'));
    console.log(color('│ ') + message + color(' │'));
    console.log(color('└' + '─'.repeat(width - 2) + '┘'));

    this.resumeSpinner();
  }

  /**
   * Girinti ile liste öğesi yazdırır
   *
   * @param items - Liste öğeleri
   * @param indent - Girinti seviyesi (varsayılan: 1)
   */
  public list(items: string[], indent: number = 1): void {
    this.pauseSpinner();

    const prefix = '  '.repeat(indent) + '• ';
    items.forEach(item => {
      console.log(chalk.gray(prefix) + item);
    });

    this.resumeSpinner();
  }

  /**
   * Ağaç yapısı ile liste öğesi yazdırır
   *
   * @param items - Liste öğeleri
   * @param isLast - Her öğe için son mu (opsiyonel)
   */
  public tree(items: Array<{ text: string; isLast?: boolean }>): void {
    this.pauseSpinner();

    items.forEach((item, index) => {
      const isLast = item.isLast ?? (index === items.length - 1);
      const prefix = isLast ? '└─ ' : '├─ ';
      console.log(chalk.gray(prefix) + item.text);
    });

    this.resumeSpinner();
  }

  /**
   * Verbose mod aktif mi?
   */
  public isVerbose(): boolean {
    return this.verbose;
  }

  /**
   * Yeni Logger instance oluşturur (ayarları kopyalayarak)
   *
   * @param verbose - Verbose mod (override)
   * @returns Yeni Logger instance
   */
  public clone(verbose?: boolean): Logger {
    return new Logger(verbose ?? this.verbose, this.minLevel);
  }
}

// Default export
export default Logger;
