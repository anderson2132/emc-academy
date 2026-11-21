import { Controller, Get, Logger, Param, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { AllowInactive, CurrentUser, Public } from '../../../common/auth/decorators';
import { ACCESS_COOKIE, setAuthCookies } from '../../../common/auth/cookies';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AuthService } from '../auth.service';
import { OidcError, OidcService } from './oidc.service';
import { isOidcProvider } from './oidc-providers';
import type { OidcMode } from './oidc-decision';

const FLOW_COOKIE = 'emc_oidc';

/**
 * Ingreso con Google y Microsoft.
 *   GET /auth/oidc/:provider            → redirige al proveedor (?mode=link para vincular)
 *   GET /auth/oidc/:provider/callback   → retorno del proveedor; redirige al frontend
 */
@ApiTags('auth')
@Controller('auth')
export class OidcController {
  private readonly logger = new Logger(OidcController.name);

  constructor(
    private readonly oidc: OidcService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  /** Qué proveedores están configurados (el frontend oculta los demás). */
  @Public()
  @Get('providers')
  providers() {
    return this.oidc.enabled();
  }

  /** Formas de ingreso vinculadas a la cuenta actual. */
  @AllowInactive()
  @Get('login-methods')
  loginMethods(@CurrentUser() user: AuthUser) {
    return this.auth.listLoginMethods(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('oidc/:provider')
  async start(@Param('provider') provider: string, @Query('mode') modeRaw: string | undefined, @Res() res: Response) {
    const mode: OidcMode = modeRaw === 'link' ? 'link' : 'login';
    if (!isOidcProvider(provider)) return res.redirect(this.front('login', { error: 'PROVIDER_DISABLED' }));
    try {
      const { url, flowCookie } = await this.oidc.start(provider, mode);
      res.cookie(FLOW_COOKIE, flowCookie, this.flowCookieOptions(10 * 60 * 1000));
      return res.redirect(url);
    } catch (err) {
      return res.redirect(this.front(mode === 'link' ? 'panel' : 'login', { error: this.code(err) }));
    }
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('oidc/:provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query() query: { code?: string; state?: string; error?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const flowCookie: string | undefined = req.cookies?.[FLOW_COOKIE];
    res.clearCookie(FLOW_COOKIE, this.flowCookieOptions());
    let mode: OidcMode = 'login';

    try {
      if (!isOidcProvider(provider)) throw new OidcError('PROVIDER_DISABLED');
      const finished = await this.oidc.finish(provider, query, flowCookie);
      mode = finished.mode;

      const currentUserId = mode === 'link' ? await this.sessionUserId(req) : null;
      const { result, tokens } = await this.auth.signInWithOidc(
        finished.identity, mode, currentUserId, { ip: req.ip, userAgent: req.headers['user-agent'] },
      );

      if (tokens) {
        setAuthCookies(res, this.cookieSettings(), tokens.accessToken, tokens.refreshToken);
      }
      const params: Record<string, string> = result === 'LINKED' ? { linked: provider } : result === 'CREATED' ? { welcome: '1' } : {};
      return res.redirect(this.front('panel', params));
    } catch (err) {
      return res.redirect(this.front(mode === 'link' ? 'panel' : 'login', { error: this.code(err), provider }));
    }
  }

  // ───────────── Internos ─────────────

  /** Usuario con sesión (cookie de acceso válida), para el modo vincular. */
  private async sessionUserId(req: Request): Promise<string | null> {
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string') return null;
    try {
      const { sub } = await this.jwt.verifyAsync<{ sub: string }>(token, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') });
      return sub;
    } catch {
      return null;
    }
  }

  private code(err: unknown): string {
    if (err instanceof OidcError) return err.code;
    this.logger.error(`Error OIDC inesperado: ${(err as Error)?.message}`);
    return 'UNEXPECTED';
  }

  private front(page: 'login' | 'panel', params: Record<string, string> = {}): string {
    const base = this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/$/, '');
    const qs = new URLSearchParams(params).toString();
    return `${base}/campus/${page}.html${qs ? `?${qs}` : ''}`;
  }

  private cookieSettings() {
    return { secure: this.config.get('NODE_ENV') === 'production', domain: this.config.get<string>('COOKIE_DOMAIN') };
  }

  private flowCookieOptions(maxAge?: number): CookieOptions {
    // Path limitado al flujo; SameSite=Lax permite que llegue en el retorno (navegación GET).
    return { httpOnly: true, secure: this.cookieSettings().secure, sameSite: 'lax', path: '/auth/oidc', maxAge };
  }
}
