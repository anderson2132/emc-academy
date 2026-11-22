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

  /**
   * Avisa a varias personas (sin repetir y omitiendo cuentas sin correo).
   * Un fallo de correo nunca debe deshacer la operación que lo originó.
   */
  async notify(to: (string | null | undefined)[], subject: string, text: string): Promise<void> {
    const unique = [...new Set(to.filter((e): e is string => !!e))];
    for (const email of unique) {
      try {
        await this.send({ to: email, subject, text });
      } catch (err) {
        this.logger.error(`No se pudo enviar "${subject}" a ${email}: ${String(err)}`);
      }
    }
  }
}
