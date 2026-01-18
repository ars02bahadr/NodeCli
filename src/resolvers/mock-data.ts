/**
 * Apigen - Mock Data Resolver
 *
 * Bu modül, @faker-js/faker kullanarak ApiSchema'dan gerçekçi test verisi üretir.
 *
 * Akıllı alan algılama:
 * - "email" içeren alanlar için faker.internet.email()
 * - "phone" için faker.phone.number()
 * - "name" için faker.person.fullName()
 * - "address" için faker.location.streetAddress()
 * - "date" için faker.date.recent()
 * - "price", "amount" için faker.commerce.price()
 * - "id" için faker.string.uuid()
 * - "url" için faker.internet.url()
 *
 * Özellikler:
 * - Recursive object ve array desteği
 * - Seed değeri ile tekrarlanabilir data
 * - Türkçe locale desteği (tr)
 * - Format-based generation (email, uuid, date-time vb.)
 *
 * @module resolvers/mock-data
 */

import { faker, Faker } from '@faker-js/faker';
import { tr, en } from '@faker-js/faker';
import {
  ApiProject,
  ApiEndpoint,
  ApiSchema,
  ApiParameter,
  SchemaType
} from '../core/types';

// ============================================================================
// AKILLI ALAN ALGILAMA KURALLARI
// ============================================================================

/**
 * Alan adına göre faker metodu seçimi
 *
 * Alan adı bu keyword'lerden birini içeriyorsa ilgili faker metodu kullanılır.
 */
interface FieldRule {
  keywords: string[];
  generator: (f: Faker) => unknown;
}

const FIELD_RULES: FieldRule[] = [
  // ID alanları
  {
    keywords: ['id', 'uuid', 'guid'],
    generator: (f) => f.string.uuid()
  },
  // İsim alanları
  {
    keywords: ['firstname', 'first_name', 'ad'],
    generator: (f) => f.person.firstName()
  },
  {
    keywords: ['lastname', 'last_name', 'surname', 'soyad'],
    generator: (f) => f.person.lastName()
  },
  {
    keywords: ['fullname', 'full_name', 'name', 'isim', 'adsoyad'],
    generator: (f) => f.person.fullName()
  },
  {
    keywords: ['username', 'user_name', 'kullaniciadi'],
    generator: (f) => f.internet.userName()
  },
  // İletişim alanları
  {
    keywords: ['email', 'mail', 'eposta'],
    generator: (f) => f.internet.email()
  },
  {
    keywords: ['phone', 'telefon', 'tel', 'mobile', 'gsm'],
    generator: (f) => f.phone.number()
  },
  // Adres alanları
  {
    keywords: ['address', 'adres', 'street', 'sokak'],
    generator: (f) => f.location.streetAddress()
  },
  {
    keywords: ['city', 'sehir', 'il'],
    generator: (f) => f.location.city()
  },
  {
    keywords: ['country', 'ulke'],
    generator: (f) => f.location.country()
  },
  {
    keywords: ['zipcode', 'postcode', 'posta_kodu', 'zip'],
    generator: (f) => f.location.zipCode()
  },
  {
    keywords: ['latitude', 'lat', 'enlem'],
    generator: (f) => f.location.latitude()
  },
  {
    keywords: ['longitude', 'lng', 'lon', 'boylam'],
    generator: (f) => f.location.longitude()
  },
  // URL ve web alanları
  {
    keywords: ['url', 'link', 'website', 'site'],
    generator: (f) => f.internet.url()
  },
  {
    keywords: ['avatar', 'image', 'photo', 'resim', 'fotograf'],
    generator: (f) => f.image.avatar()
  },
  {
    keywords: ['domain'],
    generator: (f) => f.internet.domainName()
  },
  // Tarih alanları
  {
    keywords: ['createdat', 'created_at', 'olusturulma'],
    generator: (f) => f.date.past().toISOString()
  },
  {
    keywords: ['updatedat', 'updated_at', 'guncelleme'],
    generator: (f) => f.date.recent().toISOString()
  },
  {
    keywords: ['birthday', 'birthdate', 'dogum_tarihi'],
    generator: (f) => f.date.birthdate().toISOString().split('T')[0]
  },
  {
    keywords: ['date', 'tarih'],
    generator: (f) => f.date.recent().toISOString()
  },
  // Para/fiyat alanları
  {
    keywords: ['price', 'fiyat', 'amount', 'tutar', 'total', 'toplam'],
    generator: (f) => parseFloat(f.commerce.price())
  },
  {
    keywords: ['currency', 'para_birimi'],
    generator: (f) => f.finance.currencyCode()
  },
  // Metin alanları
  {
    keywords: ['description', 'aciklama', 'desc'],
    generator: (f) => f.lorem.paragraph()
  },
  {
    keywords: ['title', 'baslik', 'header'],
    generator: (f) => f.lorem.sentence()
  },
  {
    keywords: ['content', 'icerik', 'body', 'text'],
    generator: (f) => f.lorem.paragraphs(2)
  },
  {
    keywords: ['summary', 'ozet'],
    generator: (f) => f.lorem.sentences(2)
  },
  {
    keywords: ['comment', 'yorum', 'note', 'not'],
    generator: (f) => f.lorem.sentence()
  },
  // Sayısal alanlar
  {
    keywords: ['age', 'yas'],
    generator: (f) => f.number.int({ min: 18, max: 80 })
  },
  {
    keywords: ['quantity', 'qty', 'adet', 'miktar', 'count'],
    generator: (f) => f.number.int({ min: 1, max: 100 })
  },
  {
    keywords: ['rating', 'score', 'puan'],
    generator: (f) => f.number.float({ min: 1, max: 5, fractionDigits: 1 })
  },
  {
    keywords: ['percentage', 'percent', 'yuzde'],
    generator: (f) => f.number.int({ min: 0, max: 100 })
  },
  // Boolean alanlar
  {
    keywords: ['isactive', 'is_active', 'aktif', 'active'],
    generator: () => true
  },
  {
    keywords: ['isenabled', 'is_enabled', 'enabled'],
    generator: () => true
  },
  {
    keywords: ['isdeleted', 'is_deleted', 'deleted', 'silindi'],
    generator: () => false
  },
  // Şifre alanları
  {
    keywords: ['password', 'sifre', 'pwd'],
    generator: (f) => f.internet.password()
  },
  // Şirket alanları
  {
    keywords: ['company', 'firma', 'sirket'],
    generator: (f) => f.company.name()
  },
  {
    keywords: ['jobtitle', 'job_title', 'position', 'pozisyon'],
    generator: (f) => f.person.jobTitle()
  },
  // Ürün alanları
  {
    keywords: ['product', 'urun'],
    generator: (f) => f.commerce.productName()
  },
  {
    keywords: ['category', 'kategori'],
    generator: (f) => f.commerce.department()
  },
  {
    keywords: ['color', 'renk'],
    generator: (f) => f.color.human()
  },
  {
    keywords: ['size', 'beden'],
    generator: (f) => f.helpers.arrayElement(['S', 'M', 'L', 'XL'])
  },
  // Teknik alanlar
  {
    keywords: ['ip', 'ipaddress', 'ip_address'],
    generator: (f) => f.internet.ip()
  },
  {
    keywords: ['mac', 'macaddress'],
    generator: (f) => f.internet.mac()
  },
  {
    keywords: ['useragent', 'user_agent'],
    generator: (f) => f.internet.userAgent()
  },
  {
    keywords: ['token'],
    generator: (f) => f.string.alphanumeric(32)
  }
];

// ============================================================================
// MOCK DATA RESOLVER
// ============================================================================

/**
 * Mock Data Resolver
 *
 * API endpoint'leri için örnek veri üretir.
 *
 * @example
 * ```typescript
 * const resolver = new MockDataResolver('tr', 12345);
 * await resolver.resolve(project);
 *
 * // Artık project.groups[*].endpoints[*].requestBody.example dolu
 * ```
 */
export class MockDataResolver {
  /** Faker instance */
  private faker: Faker;

  /**
   * MockDataResolver constructor
   *
   * @param locale - Faker locale (tr, en vb.)
   * @param seed - Seed değeri (tekrarlanabilirlik için)
   */
  constructor(locale: string = 'tr', seed?: number) {
    // Locale'e göre faker oluştur
    this.faker = locale === 'tr'
      ? new Faker({ locale: [tr, en] })
      : new Faker({ locale: [en] });

    // Seed ayarla
    if (seed !== undefined) {
      this.faker.seed(seed);
    }
  }

  /**
   * Proje için mock data üretir
   *
   * Tüm endpoint'lerin requestBody ve response'larına örnek veri ekler.
   *
   * @param project - API projesi
   */
  public async resolve(project: ApiProject): Promise<void> {
    for (const group of project.groups) {
      for (const endpoint of group.endpoints) {
        this.resolveEndpoint(endpoint);
      }
    }
  }

  /**
   * Tek endpoint için mock data üretir
   */
  private resolveEndpoint(endpoint: ApiEndpoint): void {
    // Request body
    if (endpoint.requestBody && !endpoint.requestBody.example) {
      endpoint.requestBody.example = this.generateFromSchema(
        endpoint.requestBody.schema
      );
    }

    // Parametreler
    for (const param of endpoint.parameters) {
      if (param.example === undefined) {
        param.example = this.generateFromSchema(param.schema, param.name);
      }
    }

    // Response'lar
    for (const response of endpoint.responses) {
      if (response.schema && !response.example) {
        response.example = this.generateFromSchema(response.schema);
      }
    }
  }

  /**
   * Schema'dan mock data üretir
   *
   * @param schema - API şeması
   * @param fieldName - Alan adı (akıllı algılama için)
   * @returns Üretilen veri
   */
  public generateFromSchema(schema: ApiSchema, fieldName?: string): unknown {
    // Mevcut örnek varsa kullan
    if (schema.example !== undefined) {
      return schema.example;
    }

    // Varsayılan değer varsa kullan
    if (schema.default !== undefined) {
      return schema.default;
    }

    // Enum varsa rastgele seç
    if (schema.enum && schema.enum.length > 0) {
      return this.faker.helpers.arrayElement(schema.enum);
    }

    // Tipe göre üret
    switch (schema.type) {
      case SchemaType.STRING:
        return this.generateString(schema, fieldName);

      case SchemaType.INTEGER:
        return this.generateInteger(schema, fieldName);

      case SchemaType.NUMBER:
        return this.generateNumber(schema, fieldName);

      case SchemaType.BOOLEAN:
        return this.generateBoolean(fieldName);

      case SchemaType.ARRAY:
        return this.generateArray(schema, fieldName);

      case SchemaType.OBJECT:
        return this.generateObject(schema);

      case SchemaType.NULL:
        return null;

      default:
        return this.generateByFieldName(fieldName) || 'string';
    }
  }

  /**
   * String değer üretir
   */
  private generateString(schema: ApiSchema, fieldName?: string): string {
    // Format varsa öncelikle onu kullan
    if (schema.format) {
      const formatted = this.generateByFormat(schema.format);
      if (formatted !== null) {
        return formatted;
      }
    }

    // Alan adına göre üret
    if (fieldName) {
      const byName = this.generateByFieldName(fieldName);
      if (byName !== null && typeof byName === 'string') {
        return byName;
      }
    }

    // Min/max length varsa
    const minLen = schema.minLength || 5;
    const maxLen = schema.maxLength || 20;

    return this.faker.string.alphanumeric({ length: { min: minLen, max: maxLen } });
  }

  /**
   * Format'a göre string üretir
   */
  private generateByFormat(format: string): string | null {
    const formatLower = format.toLowerCase();

    switch (formatLower) {
      case 'email':
        return this.faker.internet.email();
      case 'uri':
      case 'url':
        return this.faker.internet.url();
      case 'uuid':
        return this.faker.string.uuid();
      case 'date':
        return this.faker.date.recent().toISOString().split('T')[0];
      case 'date-time':
      case 'datetime':
        return this.faker.date.recent().toISOString();
      case 'time':
        return this.faker.date.recent().toISOString().split('T')[1].split('.')[0];
      case 'password':
        return this.faker.internet.password();
      case 'byte':
        return Buffer.from(this.faker.lorem.word()).toString('base64');
      case 'binary':
        return '<binary>';
      case 'ipv4':
        return this.faker.internet.ipv4();
      case 'ipv6':
        return this.faker.internet.ipv6();
      case 'hostname':
        return this.faker.internet.domainName();
      case 'phone':
        return this.faker.phone.number();
      default:
        return null;
    }
  }

  /**
   * Alan adına göre değer üretir
   */
  private generateByFieldName(fieldName?: string): unknown {
    if (!fieldName) return null;

    const nameLower = fieldName.toLowerCase().replace(/[_-]/g, '');

    // Kurallara bak
    for (const rule of FIELD_RULES) {
      for (const keyword of rule.keywords) {
        const keywordNormalized = keyword.replace(/[_-]/g, '');
        if (nameLower.includes(keywordNormalized) || nameLower === keywordNormalized) {
          return rule.generator(this.faker);
        }
      }
    }

    return null;
  }

  /**
   * Integer değer üretir
   */
  private generateInteger(schema: ApiSchema, fieldName?: string): number {
    // Alan adına göre kontrol
    if (fieldName) {
      const byName = this.generateByFieldName(fieldName);
      if (typeof byName === 'number') {
        return Math.floor(byName);
      }
    }

    const min = schema.minimum ?? 1;
    const max = schema.maximum ?? 1000;

    return this.faker.number.int({ min, max });
  }

  /**
   * Number (float) değer üretir
   */
  private generateNumber(schema: ApiSchema, fieldName?: string): number {
    // Alan adına göre kontrol
    if (fieldName) {
      const byName = this.generateByFieldName(fieldName);
      if (typeof byName === 'number') {
        return byName;
      }
    }

    const min = schema.minimum ?? 0;
    const max = schema.maximum ?? 1000;

    return this.faker.number.float({ min, max, fractionDigits: 2 });
  }

  /**
   * Boolean değer üretir
   */
  private generateBoolean(fieldName?: string): boolean {
    // Alan adına göre kontrol
    if (fieldName) {
      const byName = this.generateByFieldName(fieldName);
      if (typeof byName === 'boolean') {
        return byName;
      }
    }

    return this.faker.datatype.boolean();
  }

  /**
   * Array değer üretir
   */
  private generateArray(schema: ApiSchema, fieldName?: string): unknown[] {
    const itemCount = this.faker.number.int({ min: 1, max: 3 });
    const result: unknown[] = [];

    if (schema.items) {
      for (let i = 0; i < itemCount; i++) {
        result.push(this.generateFromSchema(schema.items, fieldName));
      }
    }

    return result;
  }

  /**
   * Object değer üretir
   */
  private generateObject(schema: ApiSchema): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        result[key] = this.generateFromSchema(propSchema, key);
      }
    }

    return result;
  }
}

export default MockDataResolver;
