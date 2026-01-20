# Apigen CLI

**API dokümantasyonu ve test araçları otomatik üretici**

Apigen CLI, API kaynak kodunuzu veya spesifikasyon dosyalarınızı analiz ederek otomatik olarak Postman koleksiyonları, cURL scriptleri ve Markdown dokümantasyon üretir. Çoklu framework ve dil desteği sunar.

## 🚀 Özellikler

- **Çoklu Framework Desteği**: OpenAPI/Swagger, FastAPI, Flask, Django REST, Spring Boot, ASP.NET Core
- **Otomatik Framework Algılama**: Proje yapısını analiz ederek framework'ü otomatik tespit eder
- **Çoklu Çıktı Formatı**:
  - Postman Collection v2.1 (JSON)
  - cURL shell scriptleri
  - Markdown API dokümantasyonu
- **Mock Veri Üretimi**: Faker.js ile gerçekçi örnek veriler
- **Kimlik Doğrulama Desteği**: Bearer Token, API Key, Basic Auth, OAuth2
- **Watch Modu**: Kaynak dosya değişikliklerinde otomatik yeniden üretim
- **Esnek Konfigürasyon**: JSON config, environment variables ve CLI argümanları

## 📦 Kurulum

### Global Kurulum

```bash
npm install -g apigen-cli
```

### Lokal Kullanım

```bash
npx apigen-cli
```

### Gereksinimler

- Node.js >= 18.0.0
- npm veya yarn

## 🎯 Hızlı Başlangıç

### 1. Temel Kullanım

API projenizin kök dizininde:

```bash
# Otomatik algılama ile tüm çıktıları üret
apigen generate --all

# Çıktılar ./apigen-output/ dizininde oluşturulur
```

### 2. Framework Spesifik Kullanım

```bash
# OpenAPI/Swagger dosyasından
apigen generate -s ./openapi.yaml --postman

# FastAPI projesinden
apigen generate -f fastapi --readme

# Spring Boot projesinden
apigen generate -f spring --all

# Flask projesinden
apigen generate -f flask --curl --readme
```

### 3. Özelleştirilmiş Çıktı

```bash
# Belirli kaynak ve çıktı dizini
apigen generate -s ./src/api -o ./docs --all

# Verbose logging ile
apigen generate --all --verbose

# Mock veri olmadan
apigen generate --all --no-mock
```

## 📋 Komutlar

### `apigen generate`

Ana komut - framework algılama, API çıkarma ve dokümantasyon üretimi yapar.

```bash
apigen generate [seçenekler]
```

**Seçenekler:**

| Seçenek | Açıklama | Varsayılan |
|---------|----------|-----------|
| `-s, --source <path>` | Kaynak dosya veya dizin | `.` (mevcut dizin) |
| `-o, --output <dir>` | Çıktı dizini | `./apigen-output` |
| `-f, --framework <type>` | Framework tipi (auto, openapi, fastapi, flask, django, spring, aspnet) | `auto` |
| `--postman` | Postman koleksiyonu üret | `false` |
| `--curl` | cURL scriptleri üret | `false` |
| `--readme` | Markdown dokümantasyon üret | `false` |
| `--all` | Tüm çıktıları üret | `false` |
| `--no-mock` | Mock veri üretimini devre dışı bırak | `false` |
| `--verbose` | Detaylı log çıktısı | `false` |

**Örnekler:**

```bash
# Tüm formatları üret
apigen generate --all

# Sadece Postman koleksiyonu
apigen generate --postman

# Spring Boot projesi için tüm çıktılar
apigen generate -f spring -s ./backend --all

# OpenAPI spec'ten README oluştur
apigen generate -s ./api-spec.yaml --readme
```

### `apigen init`

Varsayılan konfigürasyon dosyası oluşturur.

```bash
apigen init
```

Mevcut dizinde `apigen.config.json` dosyası oluşturur. Bu dosyayı düzenleyerek projenize özel ayarlar yapabilirsiniz.

### `apigen detect`

Mevcut dizindeki framework'ü algılar ve raporlar (debug için kullanışlıdır).

```bash
apigen detect [seçenekler]
```

**Seçenekler:**

- `-s, --source <path>`: Kaynak dizin (varsayılan: mevcut dizin)
- `--verbose`: Algılama detaylarını göster

**Örnek Çıktı:**

```
✓ Framework algılandı: FastAPI
✓ Güven skoru: 95%
✓ Tespit edilen dosyalar:
  - main.py (FastAPI app tanımı)
  - requirements.txt (fastapi bağımlılığı)
  - /app/*.py (route dosyaları)
```

### `apigen watch`

Kaynak dosyaları izler ve değişiklik olduğunda otomatik yeniden üretir.

```bash
apigen watch [seçenekler]
```

**Seçenekler:**

- `-s, --source <path>`: İzlenecek kaynak dizin
- `-o, --output <dir>`: Çıktı dizini
- `--verbose`: Detaylı log

**Örnek:**

```bash
# Geliştirme sırasında otomatik üretim
apigen watch --all

# API kodunu düzenleyin, çıktılar otomatik güncellenecek
```

## ⚙️ Konfigürasyon

### Konfigürasyon Dosyası Oluşturma

```bash
apigen init
```

Bu komut `apigen.config.json` dosyası oluşturur. Örnek konfigürasyon:

```json
{
  "source": {
    "type": "auto",
    "path": ".",
    "include": ["**/*.py", "**/*.java", "**/*.cs"],
    "exclude": ["**/node_modules/**", "**/venv/**", "**/__pycache__/**"]
  },
  "output": {
    "directory": "./apigen-output",
    "clean": true
  },
  "api": {
    "title": "My API",
    "version": "1.0.0",
    "description": "API Dokümantasyonu",
    "baseUrl": "http://localhost:3000",
    "contact": {
      "name": "API Desteği",
      "email": "api@example.com"
    }
  },
  "auth": {
    "type": "bearer",
    "tokenPlaceholder": "{{token}}"
  },
  "generators": {
    "postman": {
      "enabled": true,
      "filename": "postman_collection.json",
      "includeExamples": true
    },
    "curl": {
      "enabled": true,
      "directory": "curl",
      "separateFiles": true
    },
    "readme": {
      "enabled": true,
      "filename": "API_DOCUMENTATION.md",
      "includeTableOfContents": true
    }
  },
  "mockData": {
    "enabled": true,
    "locale": "tr",
    "seed": 12345
  }
}
```

### Konfigürasyon Özellikleri

#### API Bilgileri

```json
{
  "api": {
    "title": "API Başlığı",
    "version": "1.0.0",
    "description": "API açıklaması",
    "baseUrl": "http://localhost:3000",
    "contact": {
      "name": "İletişim İsmi",
      "email": "email@example.com",
      "url": "https://example.com"
    },
    "license": {
      "name": "MIT",
      "url": "https://opensource.org/licenses/MIT"
    }
  }
}
```

#### Kimlik Doğrulama

```json
{
  "auth": {
    "type": "bearer",
    "tokenPlaceholder": "{{token}}"
  }
}
```

**Desteklenen Auth Tipleri:**

- `none`: Kimlik doğrulama yok
- `bearer`: Bearer token (Authorization: Bearer {{token}})
- `apiKey`: API Key (header veya query)
- `basic`: Basic Auth
- `oauth2`: OAuth2

**API Key Örneği:**

```json
{
  "auth": {
    "type": "apiKey",
    "keyName": "X-API-Key",
    "keyIn": "header",
    "keyValue": "{{apiKey}}"
  }
}
```

#### Mock Veri Ayarları

```json
{
  "mockData": {
    "enabled": true,
    "locale": "tr",
    "seed": 12345,
    "arrayMinItems": 1,
    "arrayMaxItems": 3,
    "customGenerators": {
      "email": "faker.internet.email()",
      "phone": "faker.phone.number()",
      "name": "faker.person.fullName()",
      "address": "faker.location.streetAddress()"
    }
  }
}
```

**Desteklenen Locale'ler:** `tr`, `en`, `de`, `fr`, `es`, `it`, vs. ([Faker.js locale listesi](https://fakerjs.dev/guide/localization.html))

#### Generator Ayarları

**Postman:**

```json
{
  "generators": {
    "postman": {
      "enabled": true,
      "filename": "postman_collection.json",
      "includeExamples": true,
      "folderStrategy": "tag"
    }
  }
}
```

- `folderStrategy`: `tag` (endpoint tag'lerine göre), `path` (URL path'e göre), `flat` (düz liste)

**cURL:**

```json
{
  "generators": {
    "curl": {
      "enabled": true,
      "directory": "curl",
      "separateFiles": true,
      "includeComments": true,
      "shellType": "bash"
    }
  }
}
```

- `shellType`: `bash`, `powershell`, `cmd`

**Markdown:**

```json
{
  "generators": {
    "readme": {
      "enabled": true,
      "filename": "API_DOCUMENTATION.md",
      "includeTableOfContents": true,
      "includeCurlExamples": true,
      "includeResponseExamples": true
    }
  }
}
```

### Environment Variables

Konfigürasyon ayarlarını environment variable'lar ile override edebilirsiniz:

```bash
# Base URL
export APIGEN_BASE_URL=https://api.production.com

# Output dizini
export APIGEN_OUTPUT=./docs

# Mock data locale
export APIGEN_MOCK_LOCALE=en

# Verbose logging
export APIGEN_VERBOSE=true

# Auth token (CI/CD için)
export APIGEN_TOKEN=your-actual-token

apigen generate --all
```

## 🎨 Çıktı Örnekleri

### 1. Postman Collection

`apigen-output/postman_collection.json` dosyası:

```json
{
  "info": {
    "name": "My API",
    "version": "1.0.0",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Users",
      "item": [
        {
          "name": "Get All Users",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/api/users",
            "auth": {
              "type": "bearer",
              "bearer": [{"key": "token", "value": "{{token}}"}]
            }
          }
        }
      ]
    }
  ]
}
```

Postman'e import edin ve hemen test etmeye başlayın!

### 2. cURL Scripts

`apigen-output/curl/get-users.sh`:

```bash
#!/bin/bash

# Get All Users
# GET /api/users
# Description: Retrieves all users from the system

BASE_URL="http://localhost:3000"
TOKEN="your-token-here"

curl -X GET \
  "${BASE_URL}/api/users" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json"
```

### 3. Markdown Documentation

`apigen-output/API_DOCUMENTATION.md`:

```markdown
# My API Documentation

Version: 1.0.0

## Table of Contents

- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [Users](#users)
    - [GET /api/users](#get-apiusers)

## Authentication

This API uses Bearer Token authentication.

## Endpoints

### Users

#### GET /api/users

Retrieves all users from the system.

**Request:**
\`\`\`bash
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer {{token}}"
\`\`\`

**Response (200 OK):**
\`\`\`json
[
  {
    "id": 1,
    "name": "Ahmet Yılmaz",
    "email": "ahmet@example.com"
  }
]
\`\`\`
```

## 🔍 Desteklenen Framework'ler

### OpenAPI/Swagger

**Desteklenen Dosyalar:**
- `openapi.json`, `openapi.yaml`, `openapi.yml`
- `swagger.json`, `swagger.yaml`, `swagger.yml`
- OpenAPI 3.0.x ve 2.0 (Swagger)

**Kullanım:**

```bash
apigen generate -s ./openapi.yaml --all
```

### Python - FastAPI

**Tespit Kriterleri:**
- `main.py`, `app.py` dosyalarında `from fastapi import` kullanımı
- `requirements.txt` veya `pyproject.toml` içinde `fastapi` bağımlılığı

**Kullanım:**

```bash
apigen generate -f fastapi --all
```

### Python - Flask

**Tespit Kriterleri:**
- `app.py`, `main.py` dosyalarında `from flask import` kullanımı
- `@app.route()` decorator'ları

**Kullanım:**

```bash
apigen generate -f flask --all
```

### Python - Django REST Framework

**Tespit Kriterleri:**
- `views.py`, `viewsets.py` dosyalarında `from rest_framework` kullanımı
- `urls.py` içinde router tanımları

**Kullanım:**

```bash
apigen generate -f django --all
```

### Java - Spring Boot

**Tespit Kriterleri:**
- `pom.xml` veya `build.gradle` içinde Spring Boot bağımlılıkları
- `@RestController`, `@RequestMapping` annotation'ları

**Kullanım:**

```bash
apigen generate -f spring -s ./src/main/java --all
```

### .NET - ASP.NET Core

**Tespit Kriterleri:**
- `.csproj` dosyalarında ASP.NET Core referansları
- `[ApiController]`, `[Route]` attribute'ları

**Kullanım:**

```bash
apigen generate -f aspnet -s ./Controllers --all
```

## 💡 Kullanım Senaryoları

### Senaryo 1: Yeni API Projesi Dokümantasyonu

```bash
cd my-fastapi-project
apigen generate --all
```

Sonuç:
- ✅ Postman collection → Anında test için hazır
- ✅ cURL scripts → CI/CD pipeline'da kullanılabilir
- ✅ Markdown doküman → GitHub/GitLab'da README olarak

### Senaryo 2: OpenAPI Spec'ten Dokümantasyon

```bash
apigen generate -s ./api-spec.yaml --readme
```

Mevcut OpenAPI dosyanızdan güzel, okunabilir Markdown doküman oluşturur.

### Senaryo 3: CI/CD Pipeline Entegrasyonu

```yaml
# .github/workflows/api-docs.yml
name: Generate API Docs
on: [push]
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install Apigen
        run: npm install -g apigen-cli
      - name: Generate Documentation
        env:
          APIGEN_BASE_URL: ${{ secrets.API_BASE_URL }}
          APIGEN_TOKEN: ${{ secrets.API_TOKEN }}
        run: apigen generate --all
      - name: Upload Artifacts
        uses: actions/upload-artifact@v2
        with:
          name: api-docs
          path: ./apigen-output/
```

### Senaryo 4: Geliştirme Sırasında Otomatik Güncelleme

```bash
# Terminal 1: API development
npm run dev

# Terminal 2: Watch mode
apigen watch --all

# Kod değiştikçe dokümantasyon otomatik güncellenir
```

### Senaryo 5: Çoklu Ortam Konfigürasyonu

```bash
# Development
APIGEN_BASE_URL=http://localhost:3000 apigen generate --all

# Staging
APIGEN_BASE_URL=https://staging-api.com apigen generate --all

# Production
APIGEN_BASE_URL=https://api.production.com apigen generate --all
```

## 🛠️ Geliştirme

### Projeyi Clone'lama

```bash
git clone https://github.com/yourusername/apigen-cli.git
cd apigen-cli
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Lokal Geliştirme

```bash
# TypeScript watch mode
npm run dev

# Lokal CLI test
npm link
apigen --version
```

## 📚 Proje Yapısı

```
apigen-cli/
├── bin/
│   └── apigen.js              # CLI entry point
├── src/
│   ├── core/                  # Ana mantık
│   │   ├── orchestrator.ts    # Pipeline koordinatörü
│   │   ├── config.ts          # Konfigürasyon yönetimi
│   │   ├── detector.ts        # Framework algılama
│   │   └── types.ts           # TypeScript tipleri
│   ├── extractors/            # Framework parsers
│   │   ├── openapi.ts
│   │   ├── python/
│   │   ├── java/
│   │   └── dotnet/
│   ├── generators/            # Çıktı oluşturucular
│   │   ├── postman.ts
│   │   ├── curl.ts
│   │   └── readme.ts
│   ├── resolvers/             # Veri işleme
│   │   ├── mock-data.ts
│   │   └── auth.ts
│   └── utils/                 # Yardımcı fonksiyonlar
│       ├── logger.ts
│       ├── file-io.ts
│       └── helpers.ts
├── templates/                 # Handlebars şablonları
│   ├── readme.hbs
│   └── curl.hbs
└── apigen.config.example.json # Örnek konfigürasyon
```

## 🤝 Katkıda Bulunma

Katkılarınızı bekliyoruz! Pull request göndermeden önce:

1. Issue açarak önerinizi tartışın
2. Fork edin ve yeni branch oluşturun
3. Değişikliklerinizi commit edin
4. Pull request açın

## 📄 Lisans

MIT License - Detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 🙋 Destek

- **Issues**: [GitHub Issues](https://github.com/yourusername/apigen-cli/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/apigen-cli/discussions)
- **Email**: api-support@example.com

## 🎯 Roadmap

- [ ] GraphQL desteği
- [ ] Swagger UI otomatik host
- [ ] REST Client (VS Code) format desteği
- [ ] Insomnia collection export
- [ ] HTTP Archive (HAR) format
- [ ] API versiyonlama desteği
- [ ] Custom template desteği
- [ ] Webhook endpoint testi
- [ ] Performance benchmarking

## ⭐ Teşekkürler

Bu projeyi beğendiyseniz yıldız vermeyi unutmayın!

---

**Apigen CLI** - API dokümantasyonunu otomatikleştirin, zamandan kazanın! 🚀
