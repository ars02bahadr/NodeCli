#!/usr/bin/env node

/**
 * Apigen CLI - Ana Giriş Noktası (Entry Point)
 *
 * Bu dosya CLI uygulamasının başlangıç noktasıdır.
 * Shebang (#!) satırı sayesinde doğrudan çalıştırılabilir.
 *
 * Kullanım:
 *   npx apigen [command] [options]
 *   veya global kurulum sonrası: apigen [command] [options]
 *
 * Bu dosya sadece TypeScript derlenmiş kodunu yükler ve çalıştırır.
 * Asıl iş mantığı src/core/orchestrator.ts dosyasındadır.
 *
 * @module bin/apigen
 * @author Apigen CLI
 */

'use strict';

/**
 * Node.js versiyon kontrolü
 *
 * Bu CLI minimum Node.js 18.0.0 gerektirir.
 * Modern JavaScript özellikleri için gereklidir.
 */
const requiredMajorVersion = 18;
const currentVersion = process.versions.node;
const currentMajorVersion = parseInt(currentVersion.split('.')[0], 10);

if (currentMajorVersion < requiredMajorVersion) {
    console.error(
        `\x1b[31mHata: Apigen CLI, Node.js ${requiredMajorVersion}.0.0 veya üzeri gerektirir.\x1b[0m\n` +
        `Mevcut versiyon: ${currentVersion}\n` +
        `Lütfen Node.js'i güncelleyin: https://nodejs.org/`
    );
    process.exit(1);
}

/**
 * Ana fonksiyon
 */
async function main() {
    try {
        // Derlenmiş dosyanın varlığını kontrol et
        const fs = require('fs');
        const path = require('path');

        const orchestratorPath = path.resolve(__dirname, '../dist/core/orchestrator.js');

        if (!fs.existsSync(orchestratorPath)) {
            console.error(
                '\x1b[31mHata: Derlenmiş dosyalar bulunamadı!\x1b[0m\n\n' +
                'Projeyi önce derlemeniz gerekiyor:\n' +
                '  npm run build\n\n' +
                'veya geliştirme modunda:\n' +
                '  npm run dev'
            );
            process.exit(1);
        }

        // Orchestrator modülünü yükle ve çalıştır
        const { main } = require('../dist/core/orchestrator.js');

        // CLI'ı başlat
        await main();

    } catch (error) {
        // Modül yükleme hatası
        if (error.code === 'MODULE_NOT_FOUND') {
            console.error(
                '\x1b[31mHata: Gerekli modüller bulunamadı!\x1b[0m\n\n' +
                'Bağımlılıkları yükleyin:\n' +
                '  npm install\n\n' +
                'Ardından projeyi derleyin:\n' +
                '  npm run build'
            );
            process.exit(1);
        }

        // Diğer hatalar
        console.error('\x1b[31mBeklenmeyen bir hata oluştu:\x1b[0m');
        console.error(error);

        // Hata ayıklama bilgisi
        if (process.env.DEBUG || process.argv.includes('--verbose')) {
            console.error('\n\x1b[33mHata Detayları:\x1b[0m');
            console.error(error.stack);
        }

        process.exit(1);
    }
}

/**
 * Kesme sinyallerini yakala (Ctrl+C)
 */
process.on('SIGINT', () => {
    console.log('\n\x1b[33mİşlem kullanıcı tarafından iptal edildi.\x1b[0m');
    process.exit(0);
});

/**
 * Yakalanmamış promise rejection'ları yakala
 */
process.on('unhandledRejection', (reason, promise) => {
    console.error('\x1b[31mYakalanmamış Promise Rejection:\x1b[0m');
    console.error(reason);
    process.exit(1);
});

/**
 * Yakalanmamış exception'ları yakala
 */
process.on('uncaughtException', (error) => {
    console.error('\x1b[31mYakalanmamış Exception:\x1b[0m');
    console.error(error);
    process.exit(1);
});

// CLI'ı başlat
main();
