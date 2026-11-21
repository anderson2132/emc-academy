/**
 * Valida las variables de entorno al arrancar. Si falta algo crítico,
 * la API no inicia (mejor fallar temprano que en producción).
 */
export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  FRONTEND_URL: string;
  CORS_ORIGINS: string[];
  JWT_ACCESS_SECRET: string;
  COOKIE_DOMAIN?: string;
  /** lax (recomendado, mismo dominio) | none (temporal: github.io + railway.app). */
  COOKIE_SAMESITE: 'lax' | 'none';
  /** URL pública de esta API (para las direcciones de retorno de Google/Microsoft). */
  API_PUBLIC_URL: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  /** common = cuentas personales y de empresa/colegio. */
  MICROSOFT_TENANT: string;
}

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const errors: string[] = [];
  const str = (key: string, fallback?: string): string => {
    const v = raw[key];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    if (fallback !== undefined) return fallback;
    errors.push(`Falta la variable ${key}`);
    return '';
  };

  const nodeEnv = str('NODE_ENV', 'development');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    errors.push('NODE_ENV debe ser development, test o production');
  }

  const secret = str('JWT_ACCESS_SECRET');
  if (secret && secret.length < 32) errors.push('JWT_ACCESS_SECRET debe tener al menos 32 caracteres');

  const frontendUrl = str('FRONTEND_URL', 'http://localhost:8080');
  const env: AppEnv = {
    NODE_ENV: nodeEnv as AppEnv['NODE_ENV'],
    PORT: Number(str('PORT', '3000')),
    DATABASE_URL: str('DATABASE_URL'),
    FRONTEND_URL: frontendUrl,
    CORS_ORIGINS: str('CORS_ORIGINS', frontendUrl)
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    JWT_ACCESS_SECRET: secret,
    COOKIE_DOMAIN: str('COOKIE_DOMAIN', '') || undefined,
    COOKIE_SAMESITE: str('COOKIE_SAMESITE', 'lax').toLowerCase() as AppEnv['COOKIE_SAMESITE'],
    API_PUBLIC_URL: str('API_PUBLIC_URL', `http://localhost:${str('PORT', '3000')}`),
    GOOGLE_CLIENT_ID: str('GOOGLE_CLIENT_ID', '') || undefined,
    GOOGLE_CLIENT_SECRET: str('GOOGLE_CLIENT_SECRET', '') || undefined,
    MICROSOFT_CLIENT_ID: str('MICROSOFT_CLIENT_ID', '') || undefined,
    MICROSOFT_CLIENT_SECRET: str('MICROSOFT_CLIENT_SECRET', '') || undefined,
    MICROSOFT_TENANT: str('MICROSOFT_TENANT', 'common'),
  };

  if (Number.isNaN(env.PORT)) errors.push('PORT debe ser numérico');
  if (!['lax', 'none'].includes(env.COOKIE_SAMESITE)) errors.push('COOKIE_SAMESITE debe ser lax o none');
  if (!!env.GOOGLE_CLIENT_ID !== !!env.GOOGLE_CLIENT_SECRET) errors.push('Google: definir GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET juntos');
  if (!!env.MICROSOFT_CLIENT_ID !== !!env.MICROSOFT_CLIENT_SECRET) errors.push('Microsoft: definir MICROSOFT_CLIENT_ID y MICROSOFT_CLIENT_SECRET juntos');
  if (errors.length) throw new Error(`Configuración inválida:\n - ${errors.join('\n - ')}`);
  return env;
}
