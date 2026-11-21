import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Cliente dentro de una transacción interactiva (`prisma.$transaction(async (tx) => ...)`). */
export type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
