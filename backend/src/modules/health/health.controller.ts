import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/auth/decorators';

@ApiTags('salud')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up', time: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
  }
}
