import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomToken } from '../crypto.util';
import { buildProviders, OidcProviderConfig, OidcProviderName } from './oidc-providers';
import type { OidcMode } from './oidc-decision';

/** Lo que nos importa de la identidad devuelta por el proveedor. */
export interface OidcIdentity {
  provider: OidcProviderName;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/** Contenido de la cookie temporal (firmada) que une el inicio y el retorno del flujo. */
interface FlowState {
  p: OidcProviderName;
  s: string; // state
  n: string; // nonce
  v: string; // PKCE code_verifier
  m: OidcMode;
}

export class OidcError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

const FLOW_TTL_SECONDS = 10 * 60;
const FLOW_AUDIENCE = 'emc-oidc-flow';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private readonly providers: Partial<Record<OidcProviderName, OidcProviderConfig>>;
  private readonly jwks = new Map<OidcProviderName, ReturnType<typeof createRemoteJWKSet>>();

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.providers = buildProviders({
      GOOGLE_CLIENT_ID: config.get('GOOGLE_CLIENT_ID'),
      GOOGLE_CLIENT_SECRET: config.get('GOOGLE_CLIENT_SECRET'),
      MICROSOFT_CLIENT_ID: config.get('MICROSOFT_CLIENT_ID'),
      MICROSOFT_CLIENT_SECRET: config.get('MICROSOFT_CLIENT_SECRET'),
      MICROSOFT_TENANT: config.get('MICROSOFT_TENANT'),
    });
  }

  enabled(): Record<OidcProviderName, boolean> {
    return { google: !!this.providers.google, microsoft: !!this.providers.microsoft };
  }

  redirectUri(name: OidcProviderName): string {
    return `${this.config.getOrThrow<string>('API_PUBLIC_URL').replace(/\/$/, '')}/auth/oidc/${name}/callback`;
  }

  /** Paso 1: URL del proveedor + cookie firmada con state/nonce/verifier. */
  async start(name: OidcProviderName, mode: OidcMode): Promise<{ url: string; flowCookie: string }> {
    const p = this.provider(name);
    const flow: FlowState = { p: name, s: randomToken(), n: randomToken(), v: randomToken(), m: mode };
    const challenge = createHash('sha256').update(flow.v).digest('base64url');

    const url = new URL(p.authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: p.clientId,
      redirect_uri: this.redirectUri(name),
      response_type: 'code',
      scope: p.scope,
      state: flow.s,
      nonce: flow.n,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...p.extraAuthParams,
    }).toString();

    const flowCookie = await this.jwt.signAsync(flow, {
      secret: this.secret(),
      audience: FLOW_AUDIENCE,
      expiresIn: FLOW_TTL_SECONDS,
    });
    return { url: url.toString(), flowCookie };
  }

  /** Paso 2: valida el retorno, canjea el código y verifica el id_token. */
  async finish(
    name: OidcProviderName,
    query: { code?: string; state?: string; error?: string },
    flowCookie: string | undefined,
  ): Promise<{ identity: OidcIdentity; mode: OidcMode }> {
    if (query.error) throw new OidcError(query.error === 'access_denied' ? 'CANCELLED' : 'PROVIDER_ERROR');
    if (!flowCookie || !query.code || !query.state) throw new OidcError('INVALID_FLOW');

    let flow: FlowState;
    try {
      flow = await this.jwt.verifyAsync<FlowState>(flowCookie, { secret: this.secret(), audience: FLOW_AUDIENCE });
    } catch {
      throw new OidcError('FLOW_EXPIRED');
    }
    if (flow.p !== name || flow.s !== query.state) throw new OidcError('INVALID_FLOW');

    const p = this.provider(name);
    const res = await fetch(p.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: query.code,
        redirect_uri: this.redirectUri(name),
        client_id: p.clientId,
        client_secret: p.clientSecret,
        code_verifier: flow.v,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
    if (!res.ok || !body.id_token) {
      this.logger.warn(`Canje de código ${name} falló: ${body.error ?? res.status} ${body.error_description ?? ''}`);
      throw new OidcError('TOKEN_EXCHANGE_FAILED');
    }

    let claims;
    try {
      ({ payload: claims } = await jwtVerify(body.id_token, this.keys(p), { audience: p.clientId, clockTolerance: 60 }));
    } catch (err) {
      this.logger.warn(`id_token ${name} inválido: ${(err as Error).message}`);
      throw new OidcError('INVALID_TOKEN');
    }
    if (!p.isValidIssuer(claims.iss, claims)) throw new OidcError('INVALID_TOKEN');
    if (claims.nonce !== flow.n) throw new OidcError('INVALID_TOKEN');
    if (!claims.sub) throw new OidcError('INVALID_TOKEN');

    return { identity: this.toIdentity(name, claims), mode: flow.m };
  }

  private toIdentity(name: OidcProviderName, c: Record<string, unknown>): OidcIdentity {
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    let email = str(c.email);
    let emailVerified = false;

    if (name === 'google') {
      emailVerified = c.email_verified === true;
    } else {
      // Microsoft: el claim email es opcional y no garantiza verificación; se usa preferred_username como respaldo.
      email = email ?? str(c.preferred_username);
    }
    if (email && !EMAIL_RE.test(email)) email = null;

    return {
      provider: name,
      subject: String(c.sub),
      email: email ? email.toLowerCase() : null,
      emailVerified,
      name: str(c.name),
    };
  }

  private provider(name: OidcProviderName): OidcProviderConfig {
    const p = this.providers[name];
    if (!p) throw new OidcError('PROVIDER_DISABLED');
    return p;
  }

  private keys(p: OidcProviderConfig) {
    let set = this.jwks.get(p.name);
    if (!set) {
      set = createRemoteJWKSet(new URL(p.jwksUri));
      this.jwks.set(p.name, set);
    }
    return set;
  }

  private secret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }
}
