import { Injectable } from '@nestjs/common';
import { PrismaService, PrismaTx } from '../../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Registra cambios críticos: aprobaciones, bloqueos, pagos, correcciones, roles. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: PrismaTx): Promise<void> {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: entry.before,
        after: entry.after,
        ip: entry.ip ?? null,
      },
    });
  }
}
