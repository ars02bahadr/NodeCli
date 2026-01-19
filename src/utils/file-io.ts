/**
 * Apigen - Dosya İşlemleri Yardımcıları
 *
 * Bu modül, dosya okuma/yazma işlemleri için yardımcı fonksiyonlar sağlar.
 * Tüm dosya işlemleri bu modül üzerinden yapılarak tutarlılık sağlanır.
 *
 * Özellikler:
 * - Güvenli dosya okuma/yazma (hata yönetimi ile)
 * - Dizin oluşturma (recursive)
 * - JSON ve YAML okuma/yazma
 * - Glob pattern ile dosya bulma
 * - Dosya meta bilgileri
 *
 * @module utils/file-io
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import * as yaml from 'yaml';
import { FileInfo } from '../core/types';

// ============================================================================
// DOSYA OKUMA FONKSİYONLARI
// ============================================================================

/**
 * Dosya içeriğini okur
 *
 * UTF-8 encoding ile metin dosyası okur.
 * Dosya bulunamazsa veya okunamazsa null döner.
 *
 * @param filePath - Dosya yolu (mutlak veya göreli)
 * @returns Dosya içeriği veya null
 *
 * @example
 * ```typescript
 * const content = readFile('./config.json');
 * if (content) {
 *   console.log('İçerik:', content);
 * }
 * ```
 */
export function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return null;
  }
}

/**
 * Dosya içeriğini okur (async)
 *
 * @param filePath - Dosya yolu
 * @returns Promise<dosya içeriği veya null>
 */
export async function readFileAsync(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (error) {
    return null;
  }
}

/**
 * JSON dosyası okur ve parse eder
 *
 * @param filePath - JSON dosya yolu
 * @returns Parse edilmiş obje veya null
 *
 * @example
 * ```typescript
 * const config = readJson<Config>('./config.json');
 * if (config) {
 *   console.log('Base URL:', config.baseUrl);
 * }
 * ```
 */
export function readJson<T = unknown>(filePath: string): T | null {
  const content = readFile(filePath);
  if (!content) return null;

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    return null;
  }
}

/**
 * YAML dosyası okur ve parse eder
 *
 * @param filePath - YAML dosya yolu
 * @returns Parse edilmiş obje veya null
 *
 * @example
 * ```typescript
 * const spec = readYaml<OpenApiSpec>('./openapi.yaml');
 * ```
 */
export function readYaml<T = unknown>(filePath: string): T | null {
  const content = readFile(filePath);
  if (!content) return null;

  try {
    return yaml.parse(content) as T;
  } catch (error) {
    return null;
  }
}

/**
 * JSON veya YAML dosyası okur (uzantıya göre)
 *
 * @param filePath - Dosya yolu
 * @returns Parse edilmiş obje veya null
 */
export function readJsonOrYaml<T = unknown>(filePath: string): T | null {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    return readJson<T>(filePath);
  } else if (ext === '.yaml' || ext === '.yml') {
    return readYaml<T>(filePath);
  }

  // Uzantı belirsiz, önce JSON dene
  const jsonResult = readJson<T>(filePath);
  if (jsonResult) return jsonResult;

  return readYaml<T>(filePath);
}

// ============================================================================
// DOSYA YAZMA FONKSİYONLARI
// ============================================================================

/**
 * Dosyaya içerik yazar
 *
 * Gerekirse parent dizinleri otomatik oluşturur.
 *
 * @param filePath - Hedef dosya yolu
 * @param content - Yazılacak içerik
 * @returns Başarılı ise true
 *
 * @example
 * ```typescript
 * const success = writeFile('./output/result.txt', 'Hello World');
 * ```
 */
export function writeFile(filePath: string, content: string): boolean {
  try {
    // Parent dizini oluştur
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Dosyaya içerik yazar (async)
 *
 * @param filePath - Hedef dosya yolu
 * @param content - Yazılacak içerik
 * @returns Promise<başarılı ise true>
 */
export async function writeFileAsync(filePath: string, content: string): Promise<boolean> {
  try {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * JSON dosyası yazar
 *
 * @param filePath - Hedef dosya yolu
 * @param data - Yazılacak veri
 * @param pretty - Pretty print (varsayılan: true)
 * @returns Başarılı ise true
 */
export function writeJson(filePath: string, data: unknown, pretty: boolean = true): boolean {
  const content = pretty
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);

  return writeFile(filePath, content);
}

/**
 * YAML dosyası yazar
 *
 * @param filePath - Hedef dosya yolu
 * @param data - Yazılacak veri
 * @returns Başarılı ise true
 */
export function writeYaml(filePath: string, data: unknown): boolean {
  try {
    const content = yaml.stringify(data);
    return writeFile(filePath, content);
  } catch (error) {
    return false;
  }
}

// ============================================================================
// DİZİN İŞLEMLERİ
// ============================================================================

/**
 * Dizin oluşturur (recursive)
 *
 * Zaten varsa hata vermez.
 *
 * @param dirPath - Dizin yolu
 * @returns Başarılı ise true
 *
 * @example
 * ```typescript
 * await ensureDir('./output/api/v1');
 * ```
 */
export async function ensureDir(dirPath: string): Promise<boolean> {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Dizin oluşturur (sync)
 *
 * @param dirPath - Dizin yolu
 * @returns Başarılı ise true
 */
export function ensureDirSync(dirPath: string): boolean {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Dizin var mı kontrol eder
 *
 * @param dirPath - Dizin yolu
 * @returns Var ve dizin ise true
 */
export function dirExists(dirPath: string): boolean {
  try {
    const stats = fs.statSync(dirPath);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Dosya var mı kontrol eder
 *
 * @param filePath - Dosya yolu
 * @returns Var ve dosya ise true
 */
export function fileExists(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile();
  } catch (error) {
    return false;
  }
}

// ============================================================================
// DOSYA BULMA FONKSİYONLARI
// ============================================================================

/**
 * Glob pattern ile dosya bulur
 *
 * @param pattern - Glob pattern (örn: "**\/*.ts")
 * @param options - Glob seçenekleri
 * @returns Bulunan dosya yolları
 *
 * @example
 * ```typescript
 * const pyFiles = await findFiles('**' + '/*.py', {
 *   cwd: '/project',
 *   ignore: ['**' + '/venv/**']
 * });
 * ```
 */
export async function findFiles(
  pattern: string,
  options: {
    cwd?: string;
    ignore?: string[];
    maxDepth?: number;
  } = {}
): Promise<string[]> {
  const { cwd = process.cwd(), ignore = [], maxDepth } = options;

  // Varsayılan ignore pattern'leri
  const defaultIgnore = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**'
  ];

  const result = await glob(pattern, {
    cwd,
    ignore: [...defaultIgnore, ...ignore],
    maxDepth,
    absolute: false
  });

  return result;
}

/**
 * Belirli uzantılı dosyaları bulur
 *
 * @param extensions - Uzantılar (nokta olmadan, örn: ['ts', 'js'])
 * @param options - Arama seçenekleri
 * @returns Bulunan dosya yolları
 */
export async function findFilesByExtension(
  extensions: string[],
  options: {
    cwd?: string;
    ignore?: string[];
    maxDepth?: number;
  } = {}
): Promise<string[]> {
  const extPattern = extensions.length === 1
    ? `**/*.${extensions[0]}`
    : `**/*.{${extensions.join(',')}}`;

  return findFiles(extPattern, options);
}

// ============================================================================
// DOSYA BİLGİSİ FONKSİYONLARI
// ============================================================================

/**
 * Dosya bilgilerini alır
 *
 * @param filePath - Dosya yolu
 * @returns FileInfo veya null
 */
export function getFileInfo(filePath: string): FileInfo | null {
  try {
    const stats = fs.statSync(filePath);

    if (!stats.isFile()) {
      return null;
    }

    return {
      path: path.resolve(filePath),
      name: path.basename(filePath),
      extension: path.extname(filePath).slice(1), // Noktasız
      size: stats.size,
      modifiedAt: stats.mtime
    };
  } catch (error) {
    return null;
  }
}

/**
 * Dizindeki dosyaları listeler
 *
 * @param dirPath - Dizin yolu
 * @param recursive - Alt dizinleri de dahil et
 * @returns Dosya bilgileri
 */
export async function listFiles(
  dirPath: string,
  recursive: boolean = false
): Promise<FileInfo[]> {
  const pattern = recursive ? '**/*' : '*';
  const files = await findFiles(pattern, { cwd: dirPath });

  const results: FileInfo[] = [];

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const info = getFileInfo(fullPath);
    if (info) {
      results.push(info);
    }
  }

  return results;
}

// ============================================================================
// YARDIMCI FONKSİYONLAR
// ============================================================================

/**
 * Dosya yolunu normalize eder
 *
 * - Göreceli yolu mutlak yola çevirir
 * - Platform-specific ayırıcıları düzeltir
 *
 * @param filePath - Dosya yolu
 * @param basePath - Taban yol (varsayılan: process.cwd())
 * @returns Normalize edilmiş mutlak yol
 */
export function normalizePath(filePath: string, basePath?: string): string {
  const base = basePath || process.cwd();

  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath);
  }

  return path.normalize(path.join(base, filePath));
}

/**
 * İki yol arasındaki göreli yolu hesaplar
 *
 * @param from - Başlangıç yolu
 * @param to - Hedef yolu
 * @returns Göreli yol
 */
export function relativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Dosya uzantısını değiştirir
 *
 * @param filePath - Dosya yolu
 * @param newExt - Yeni uzantı (nokta ile veya nokta olmadan)
 * @returns Yeni dosya yolu
 *
 * @example
 * ```typescript
 * changeExtension('file.ts', '.js');  // 'file.js'
 * changeExtension('file.ts', 'js');   // 'file.js'
 * ```
 */
export function changeExtension(filePath: string, newExt: string): string {
  const ext = newExt.startsWith('.') ? newExt : `.${newExt}`;
  const dir = path.dirname(filePath);
  const name = path.basename(filePath, path.extname(filePath));

  return path.join(dir, name + ext);
}

/**
 * Benzersiz dosya adı oluşturur
 *
 * Aynı isimde dosya varsa numara ekler.
 *
 * @param filePath - İstenen dosya yolu
 * @returns Benzersiz dosya yolu
 *
 * @example
 * ```typescript
 * // 'output.json' varsa 'output-1.json' döner
 * const uniquePath = getUniquePath('./output.json');
 * ```
 */
export function getUniquePath(filePath: string): string {
  if (!fileExists(filePath)) {
    return filePath;
  }

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const name = path.basename(filePath, ext);

  let counter = 1;
  let newPath = filePath;

  while (fileExists(newPath)) {
    newPath = path.join(dir, `${name}-${counter}${ext}`);
    counter++;
  }

  return newPath;
}

/**
 * Dosyayı siler
 *
 * @param filePath - Silinecek dosya yolu
 * @returns Başarılı ise true
 */
export function deleteFile(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Dizini siler (içeriğiyle birlikte)
 *
 * @param dirPath - Silinecek dizin yolu
 * @returns Başarılı ise true
 */
export function deleteDir(dirPath: string): boolean {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Dosyayı kopyalar
 *
 * @param source - Kaynak dosya yolu
 * @param destination - Hedef dosya yolu
 * @returns Başarılı ise true
 */
export function copyFile(source: string, destination: string): boolean {
  try {
    // Hedef dizini oluştur
    ensureDirSync(path.dirname(destination));
    fs.copyFileSync(source, destination);
    return true;
  } catch (error) {
    return false;
  }
}

// Default exports
export default {
  readFile,
  readFileAsync,
  readJson,
  readYaml,
  readJsonOrYaml,
  writeFile,
  writeFileAsync,
  writeJson,
  writeYaml,
  ensureDir,
  ensureDirSync,
  dirExists,
  fileExists,
  findFiles,
  findFilesByExtension,
  getFileInfo,
  listFiles,
  normalizePath,
  relativePath,
  changeExtension,
  getUniquePath,
  deleteFile,
  deleteDir,
  copyFile
};
