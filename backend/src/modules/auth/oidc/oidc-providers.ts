/**
 * Proveedores OIDC: Google y Microsoft (Entra ID).
 * Solo autentican. La autorización (roles, aprobación) es siempre nuestra.
 */
import type { JWTPayload } from 'jose';

export const OIDC_PROVIDERS = ['google', 'microsoft'] as const;
export type OidcProviderName = (typeof OIDC_PROVIDERS)[number];

export function isOidcProvider(value: string): value is OidcProviderName {
  return (OIDC_PROVIDERS as readonly string[]).includes(value);
}

export interface OidcProviderConfig {
  name: OidcProviderName;
  enumValue: 'GOOGLE' | 'MICROSOFT';
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  scope: string;
  /** Valida el emisor del id_token (Microsoft multi-tenant cambia por tenant). */
  isValidIssuer: (iss: string | undefined, claims: JWTPayload) => boolean;
  /** Extra en la URL de autorización. */
  extraAuthParams?: Record<string, string>;
}

/** Tenants "comodín" de Microsoft: aceptan varios tenants. */
const MS_MULTI_TENANT = new Set(['common', 'organizations', 'consumers']);

export function buildProviders(env: {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_TENANT?: string;
}): Partial<Record<OidcProviderName, OidcProviderConfig>> {
  const providers: Partial<Record<OidcProviderName, OidcProviderConfig>> = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      name: 'google',
      enumValue: 'GOOGLE',
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
      scope: 'openid email profile',
      isValidIssuer: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
      extraAuthParams: { prompt: 'select_account' },
    };
  }

  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    const tenant = env.MICROSOFT_TENANT || 'common';
    const base = `https://login.microsoftonline.com/${tenant}`;
    providers.microsoft = {
      name: 'microsoft',
      enumValue: 'MICROSOFT',
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      authorizationEndpoint: `${base}/oauth2/v2.0/authorize`,
      tokenEndpoint: `${base}/oauth2/v2.0/token`,
      jwksUri: `${base}/discovery/v2.0/keys`,
      scope: 'openid email profile',
      // El emisor es https://login.microsoftonline.com/{tid}/v2.0 y debe coincidir con el tid del token.
      isValidIssuer: (iss, claims) => {
        const tid = typeof claims.tid === 'string' ? claims.tid : '';
        if (!tid || iss !== `https://login.microsoftonline.com/${tid}/v2.0`) return false;
        return MS_MULTI_TENANT.has(tenant) || tenant.toLowerCase() === tid.toLowerCase();
      },
      extraAuthParams: { prompt: 'select_account', response_mode: 'query' },
    };
  }

  return providers;
}
