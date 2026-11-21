import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { originCheck } from './common/security/origin-check.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const origins = config.getOrThrow<string[]>('CORS_ORIGINS');
  const isProd = config.get('NODE_ENV') === 'production';

  // Railway y otros PaaS ponen un proxy delante: necesario para req.ip y cookies Secure.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.use(originCheck(origins));
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  if (!isProd) {
    const doc = new DocumentBuilder()
      .setTitle('EMC Academy API')
      .setDescription('API del portal y campus virtual de EMC Academy')
      .setVersion('0.1.0')
      .addCookieAuth('emc_at')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  Logger.log(`API en http://localhost:${port}${isProd ? '' : `  ·  Swagger: http://localhost:${port}/docs`}`, 'Bootstrap');
}
void bootstrap();
