import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defensa CSRF complementaria a SameSite=Lax: en peticiones que modifican datos,
 * si el navegador envía Origin, debe ser uno de los orígenes permitidos.
 * (Clientes sin navegador, como curl o pruebas, no envían Origin.)
 */
export function originCheck(allowed: string[]) {
  const allow = new Set(allowed);
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || !origin || allow.has(origin)) {
      next();
      return;
    }
    res.status(403).json({ statusCode: 403, code: 'BAD_ORIGIN', message: 'Origen no permitido.' });
  };
}
