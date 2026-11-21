import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService, ClientInfo } from './auth.service';
import { EmailDto, LoginDto, RegisterDto, ResetPasswordDto, TokenDto } from './dto';
import { AllowInactive, CurrentUser, Public } from '../../common/auth/decorators';
import { clearAuthCookies, CookieSettings, REFRESH_COOKIE, setAuthCookies } from '../../common/auth/cookies';
import type { AuthUser } from '../../common/auth/auth-user';

/** Límite estricto para rutas sensibles a fuerza bruta. */
const STRICT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle(STRICT)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(@Body() dto: TokenDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('resend-verification')
  resend(@Body() dto: EmailDto) {
    return this.auth.resendVerification(dto.email);
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto.login, dto.password, this.client(req));
    setAuthCookies(res, this.cookieSettings(), tokens.accessToken, tokens.refreshToken);
    return { ok: true };
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const tokens = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], this.client(req));
      setAuthCookies(res, this.cookieSettings(), tokens.accessToken, tokens.refreshToken);
      return { ok: true };
    } catch (err) {
      clearAuthCookies(res, this.cookieSettings());
      throw err;
    }
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res, this.cookieSettings());
    return { ok: true };
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('forgot-password')
  forgot(@Body() dto: EmailDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  /** Datos de la sesión actual (incluye estado de la cuenta, aunque no esté activa). */
  @AllowInactive()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  private client(req: Request): ClientInfo {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  private cookieSettings(): CookieSettings {
    return {
      secure: this.config.get('NODE_ENV') === 'production',
      domain: this.config.get<string>('COOKIE_DOMAIN'),
    };
  }
}
