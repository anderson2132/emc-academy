import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OidcController } from './oidc/oidc.controller';
import { OidcService } from './oidc/oidc.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, OidcController],
  providers: [AuthService, OidcService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
