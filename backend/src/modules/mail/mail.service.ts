import { Injectable, Logger } from '@nestjs/common';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Envío de correos. Por ahora (desarrollo) solo los escribe en la consola.
 * Pendiente: integrar Brevo (ADR-008) cuando se confirme el dominio.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  async send(msg: MailMessage): Promise<void> {
    this.logger.log(`\n──── CORREO (simulado) ────\nPara: ${msg.to}\nAsunto: ${msg.subject}\n\n${msg.text}\n───────────────────────────`);
  }
}
