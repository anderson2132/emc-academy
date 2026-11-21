import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** Argon2id (algoritmo por defecto de @node-rs/argon2). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Token opaco para refresh, verificación de correo y recuperación. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** En la BD solo se guarda el hash del token, nunca el token. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeLogin(value: string): string {
  return value.trim().toLowerCase();
}
