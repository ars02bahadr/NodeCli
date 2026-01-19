/**
 * Auth Header Resolver
 *
 * Bu modül API istekleri için authentication header'larını yönetir.
 * Farklı auth tiplerini destekler ve placeholder değişkenler kullanır.
 *
 * Desteklenen auth tipleri:
 * - Bearer Token (JWT, OAuth2)
 * - API Key (header veya query parameter)
 * - Basic Auth (username:password base64)
 * - Custom Header
 *
 * @module resolvers/auth
 * @author Apigen CLI
 */

import { ApiAuth, ApiEndpoint } from '../core/types.js';
import { Logger } from '../utils/logger.js';

/**
 * Auth çözümleme sonucu
 * Header adı ve değerini içerir
 */
interface AuthHeader {
    /** Header adı (örn: "Authorization", "X-API-Key") */
    name: string;
    /** Header değeri (placeholder veya gerçek değer) */
    value: string;
}

/**
 * Query parameter olarak auth bilgisi
 */
interface AuthQueryParam {
    /** Parametre adı (örn: "api_key", "token") */
    name: string;
    /** Parametre değeri */
    value: string;
}

/**
 * Auth çözümleme sonucu
 * Header ve/veya query param içerebilir
 */
interface ResolvedAuth {
    /** Auth header'ları (varsa) */
    headers: AuthHeader[];
    /** Auth query parametreleri (varsa) */
    queryParams: AuthQueryParam[];
}

/**
 * Auth Header Resolver Sınıfı
 *
 * API auth ayarlarını alır ve uygun header/query param formatına dönüştürür.
 * Placeholder değişkenler kullanarak farklı ortamlar için esneklik sağlar.
 *
 * @example
 * ```typescript
 * const resolver = new AuthResolver();
 * const auth: ApiAuth = {
 *     type: 'bearer',
 *     tokenPlaceholder: '{{token}}'
 * };
 * const result = resolver.resolve(auth);
 * // result.headers = [{ name: 'Authorization', value: 'Bearer {{token}}' }]
 * ```
 */
export class AuthResolver {
    /** Logger instance */
    private logger: Logger;

    /** Varsayılan placeholder değerler */
    private defaultPlaceholders = {
        token: '{{token}}',
        apiKey: '{{apiKey}}',
        username: '{{username}}',
        password: '{{password}}'
    };

    constructor() {
        this.logger = new Logger();
    }

    /**
     * Auth ayarlarını header/query formatına çözümler
     *
     * Bu metod, ApiAuth nesnesini alır ve uygun authentication
     * bilgilerini içeren ResolvedAuth nesnesi döndürür.
     *
     * @param auth - API auth ayarları
     * @returns Çözümlenmiş auth bilgileri (header ve query params)
     *
     * @example
     * ```typescript
     * // Bearer token örneği
     * const bearerAuth = resolver.resolve({
     *     type: 'bearer',
     *     tokenPlaceholder: '{{jwt_token}}'
     * });
     *
     * // API Key örneği
     * const apiKeyAuth = resolver.resolve({
     *     type: 'apiKey',
     *     keyName: 'X-API-Key',
     *     keyValue: '{{my_api_key}}'
     * });
     * ```
     */
    resolve(auth: ApiAuth | undefined): ResolvedAuth {
        // Auth tanımsızsa boş döndür
        if (!auth) {
            return { headers: [], queryParams: [] };
        }

        // Auth tipine göre uygun metodu çağır
        switch (auth.type) {
            case 'bearer':
                return this.resolveBearerAuth(auth);

            case 'apiKey':
                return this.resolveApiKeyAuth(auth);

            case 'basic':
                return this.resolveBasicAuth(auth);

            case 'oauth2':
                return this.resolveOAuth2Auth(auth);

            default:
                // Bilinmeyen auth tipi için uyarı ver
                this.logger.warn(`Bilinmeyen auth tipi: ${auth.type}`);
                return { headers: [], queryParams: [] };
        }
    }

    /**
     * Bearer Token auth çözümlemesi
     *
     * JWT veya OAuth2 bearer token'ları için kullanılır.
     * Authorization header'ına "Bearer <token>" formatında eklenir.
     *
     * @param auth - Bearer auth ayarları
     * @returns Authorization header içeren ResolvedAuth
     */
    private resolveBearerAuth(auth: ApiAuth): ResolvedAuth {
        // Token placeholder'ı belirle
        const token = auth.tokenPlaceholder || this.defaultPlaceholders.token;

        return {
            headers: [{
                name: 'Authorization',
                value: `Bearer ${token}`
            }],
            queryParams: []
        };
    }

    /**
     * API Key auth çözümlemesi
     *
     * API key header veya query parameter olarak gönderilebilir.
     * keyIn değerine göre uygun yere eklenir.
     *
     * @param auth - API Key auth ayarları
     * @returns Header veya query param içeren ResolvedAuth
     *
     * @example
     * ```typescript
     * // Header olarak API Key
     * { type: 'apiKey', keyName: 'X-API-Key', keyIn: 'header' }
     *
     * // Query param olarak API Key
     * { type: 'apiKey', keyName: 'api_key', keyIn: 'query' }
     * ```
     */
    private resolveApiKeyAuth(auth: ApiAuth): ResolvedAuth {
        // Key adı ve değerini belirle
        const keyName = auth.keyName || 'X-API-Key';
        const keyValue = auth.keyValue || this.defaultPlaceholders.apiKey;
        const keyIn = auth.keyIn || 'header';

        if (keyIn === 'query') {
            // Query parameter olarak ekle
            return {
                headers: [],
                queryParams: [{
                    name: keyName,
                    value: keyValue
                }]
            };
        } else {
            // Header olarak ekle (varsayılan)
            return {
                headers: [{
                    name: keyName,
                    value: keyValue
                }],
                queryParams: []
            };
        }
    }

    /**
     * Basic Auth çözümlemesi
     *
     * HTTP Basic Authentication için username:password
     * base64 olarak encode edilir.
     *
     * NOT: Gerçek uygulamada credentials placeholder kullanılmalı,
     * base64 encoding istemci tarafında yapılmalıdır.
     *
     * @param auth - Basic auth ayarları
     * @returns Authorization header içeren ResolvedAuth
     */
    private resolveBasicAuth(auth: ApiAuth): ResolvedAuth {
        // Placeholder kullan (gerçek encoding istemcide yapılacak)
        const username = auth.username || this.defaultPlaceholders.username;
        const password = auth.password || this.defaultPlaceholders.password;

        // Placeholder formatında döndür
        // Gerçek base64 encoding yerine placeholder kullanıyoruz
        // çünkü bu değerler genellikle environment variable olacak
        return {
            headers: [{
                name: 'Authorization',
                value: `Basic {{base64(${username}:${password})}}`
            }],
            queryParams: []
        };
    }

    /**
     * OAuth2 auth çözümlemesi
     *
     * OAuth2 için de bearer token kullanılır.
     * Ek olarak token endpoint bilgisi saklanabilir.
     *
     * @param auth - OAuth2 auth ayarları
     * @returns Authorization header içeren ResolvedAuth
     */
    private resolveOAuth2Auth(auth: ApiAuth): ResolvedAuth {
        // OAuth2 de sonuçta bearer token kullanır
        return this.resolveBearerAuth(auth);
    }

    /**
     * Endpoint'e auth header'larını uygular
     *
     * Bu metod, bir endpoint'in header'larına auth bilgilerini ekler.
     * Mevcut header'lar korunur, auth header'ları eklenir.
     *
     * @param endpoint - Auth eklenecek endpoint
     * @param auth - Auth ayarları
     * @returns Auth header'ları eklenmiş endpoint kopyası
     *
     * @example
     * ```typescript
     * const endpoint: ApiEndpoint = {
     *     method: 'GET',
     *     path: '/users',
     *     // ...
     * };
     * const authEndpoint = resolver.applyToEndpoint(endpoint, auth);
     * ```
     */
    applyToEndpoint(endpoint: ApiEndpoint, auth: ApiAuth | undefined): ApiEndpoint {
        // Auth yoksa endpoint'i olduğu gibi döndür
        if (!auth) {
            return endpoint;
        }

        // Auth'u çözümle
        const resolved = this.resolve(auth);

        // Endpoint'in kopyasını oluştur
        const updatedEndpoint: ApiEndpoint = { ...endpoint };

        // Header'ları ekle
        if (resolved.headers.length > 0) {
            // Mevcut header parametrelerini al
            const existingHeaders = endpoint.parameters?.filter(p => p.in === 'header') || [];

            // Auth header'larını parametre formatına dönüştür
            const authHeaderParams = resolved.headers.map(h => ({
                name: h.name,
                in: 'header' as const,
                required: true,
                schema: { type: 'string' as const },
                example: h.value,
                description: `${auth.type} authentication header`
            }));

            // Parametreleri birleştir (auth header'ları varsa üzerine yazma)
            const otherParams = endpoint.parameters?.filter(p =>
                p.in !== 'header' || !resolved.headers.some(h => h.name === p.name)
            ) || [];

            updatedEndpoint.parameters = [...otherParams, ...authHeaderParams];
        }

        // Query param'ları ekle (API Key için)
        if (resolved.queryParams.length > 0) {
            const authQueryParams = resolved.queryParams.map(q => ({
                name: q.name,
                in: 'query' as const,
                required: true,
                schema: { type: 'string' as const },
                example: q.value,
                description: `${auth.type} authentication parameter`
            }));

            // Mevcut query param'larla birleştir
            const otherParams = endpoint.parameters?.filter(p =>
                p.in !== 'query' || !resolved.queryParams.some(q => q.name === p.name)
            ) || [];

            updatedEndpoint.parameters = [...(updatedEndpoint.parameters || otherParams), ...authQueryParams];
        }

        return updatedEndpoint;
    }

    /**
     * cURL komutu için auth flag'lerini üretir
     *
     * @param auth - Auth ayarları
     * @returns cURL auth flag'leri string olarak
     *
     * @example
     * ```typescript
     * const curlAuth = resolver.toCurlFlags(auth);
     * // Bearer: -H "Authorization: Bearer {{token}}"
     * // Basic: -u "{{username}}:{{password}}"
     * // API Key: -H "X-API-Key: {{apiKey}}"
     * ```
     */
    toCurlFlags(auth: ApiAuth | undefined): string {
        if (!auth) {
            return '';
        }

        switch (auth.type) {
            case 'bearer': {
                const token = auth.tokenPlaceholder || this.defaultPlaceholders.token;
                return `-H "Authorization: Bearer ${token}"`;
            }

            case 'basic': {
                const username = auth.username || this.defaultPlaceholders.username;
                const password = auth.password || this.defaultPlaceholders.password;
                return `-u "${username}:${password}"`;
            }

            case 'apiKey': {
                const keyName = auth.keyName || 'X-API-Key';
                const keyValue = auth.keyValue || this.defaultPlaceholders.apiKey;
                const keyIn = auth.keyIn || 'header';

                if (keyIn === 'header') {
                    return `-H "${keyName}: ${keyValue}"`;
                } else {
                    // Query param için flag döndürme, URL'e eklenmeli
                    return '';
                }
            }

            case 'oauth2': {
                const token = auth.tokenPlaceholder || this.defaultPlaceholders.token;
                return `-H "Authorization: Bearer ${token}"`;
            }

            default:
                return '';
        }
    }

    /**
     * Postman auth objesi oluşturur
     *
     * Postman Collection formatında auth ayarları üretir.
     *
     * @param auth - Auth ayarları
     * @returns Postman auth objesi
     */
    toPostmanAuth(auth: ApiAuth | undefined): object | null {
        if (!auth) {
            return null;
        }

        switch (auth.type) {
            case 'bearer': {
                const token = auth.tokenPlaceholder || this.defaultPlaceholders.token;
                return {
                    type: 'bearer',
                    bearer: [{
                        key: 'token',
                        value: token,
                        type: 'string'
                    }]
                };
            }

            case 'basic': {
                const username = auth.username || this.defaultPlaceholders.username;
                const password = auth.password || this.defaultPlaceholders.password;
                return {
                    type: 'basic',
                    basic: [
                        { key: 'username', value: username, type: 'string' },
                        { key: 'password', value: password, type: 'string' }
                    ]
                };
            }

            case 'apiKey': {
                const keyName = auth.keyName || 'X-API-Key';
                const keyValue = auth.keyValue || this.defaultPlaceholders.apiKey;
                const keyIn = auth.keyIn || 'header';

                return {
                    type: 'apikey',
                    apikey: [
                        { key: 'key', value: keyName, type: 'string' },
                        { key: 'value', value: keyValue, type: 'string' },
                        { key: 'in', value: keyIn, type: 'string' }
                    ]
                };
            }

            case 'oauth2': {
                const token = auth.tokenPlaceholder || this.defaultPlaceholders.token;
                return {
                    type: 'oauth2',
                    oauth2: [{
                        key: 'accessToken',
                        value: token,
                        type: 'string'
                    }]
                };
            }

            default:
                return null;
        }
    }

    /**
     * Environment variable listesi üretir
     *
     * Auth için gerekli environment variable'ları belirler.
     * Bu liste kullanıcıya hangi değişkenleri tanımlaması
     * gerektiğini gösterir.
     *
     * @param auth - Auth ayarları
     * @returns Environment variable adları listesi
     */
    getRequiredEnvVars(auth: ApiAuth | undefined): string[] {
        if (!auth) {
            return [];
        }

        const envVars: string[] = [];

        switch (auth.type) {
            case 'bearer':
            case 'oauth2':
                // Token placeholder'dan env var adını çıkar
                const tokenPlaceholder = auth.tokenPlaceholder || this.defaultPlaceholders.token;
                const tokenVar = this.extractEnvVarName(tokenPlaceholder);
                if (tokenVar) envVars.push(tokenVar);
                break;

            case 'basic':
                const usernameVar = this.extractEnvVarName(auth.username || this.defaultPlaceholders.username);
                const passwordVar = this.extractEnvVarName(auth.password || this.defaultPlaceholders.password);
                if (usernameVar) envVars.push(usernameVar);
                if (passwordVar) envVars.push(passwordVar);
                break;

            case 'apiKey':
                const keyVar = this.extractEnvVarName(auth.keyValue || this.defaultPlaceholders.apiKey);
                if (keyVar) envVars.push(keyVar);
                break;
        }

        return envVars;
    }

    /**
     * Placeholder'dan environment variable adını çıkarır
     *
     * {{variable_name}} formatından variable_name kısmını alır.
     *
     * @param placeholder - Placeholder string (örn: "{{token}}")
     * @returns Environment variable adı veya null
     */
    private extractEnvVarName(placeholder: string): string | null {
        // {{...}} formatını kontrol et
        const match = placeholder.match(/\{\{([^}]+)\}\}/);
        if (match) {
            return match[1].trim();
        }

        // $VAR veya ${VAR} formatını kontrol et
        const shellMatch = placeholder.match(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/);
        if (shellMatch) {
            return shellMatch[1];
        }

        return null;
    }
}

/**
 * Varsayılan AuthResolver instance'ı
 * Singleton pattern - tek instance kullanımı için
 */
export const authResolver = new AuthResolver();
