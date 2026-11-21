import { decideOidc } from './oidc-decision';

describe('decideOidc (reglas de vinculación Google/Microsoft)', () => {
  describe('modo login', () => {
    it('inicia sesión si la identidad ya está vinculada', () => {
      expect(decideOidc({ mode: 'login', identityOwnerId: 'u1', currentUserId: null, emailOwnerId: 'u1' }))
        .toEqual({ action: 'LOGIN', userId: 'u1' });
    });

    it('NO vincula automáticamente si el correo ya pertenece a otra cuenta', () => {
      expect(decideOidc({ mode: 'login', identityOwnerId: null, currentUserId: null, emailOwnerId: 'u1' }))
        .toEqual({ action: 'ERROR', code: 'EMAIL_IN_USE' });
    });

    it('crea una cuenta nueva si ni la identidad ni el correo existen', () => {
      expect(decideOidc({ mode: 'login', identityOwnerId: null, currentUserId: null, emailOwnerId: null }))
        .toEqual({ action: 'CREATE' });
    });

    it('la identidad manda sobre el correo (correo cambiado en el proveedor)', () => {
      expect(decideOidc({ mode: 'login', identityOwnerId: 'u1', currentUserId: null, emailOwnerId: 'u2' }))
        .toEqual({ action: 'LOGIN', userId: 'u1' });
    });
  });

  describe('modo vincular', () => {
    it('exige sesión iniciada', () => {
      expect(decideOidc({ mode: 'link', identityOwnerId: null, currentUserId: null, emailOwnerId: null }))
        .toEqual({ action: 'ERROR', code: 'LINK_REQUIRES_SESSION' });
    });

    it('vincula a la cuenta con sesión, aunque el correo del proveedor sea distinto', () => {
      expect(decideOidc({ mode: 'link', identityOwnerId: null, currentUserId: 'u1', emailOwnerId: null }))
        .toEqual({ action: 'LINK', userId: 'u1' });
    });

    it('rechaza una identidad que ya usa otra cuenta', () => {
      expect(decideOidc({ mode: 'link', identityOwnerId: 'u2', currentUserId: 'u1', emailOwnerId: null }))
        .toEqual({ action: 'ERROR', code: 'IDENTITY_IN_USE' });
    });

    it('avisa si ya estaba vinculada a la misma cuenta', () => {
      expect(decideOidc({ mode: 'link', identityOwnerId: 'u1', currentUserId: 'u1', emailOwnerId: 'u1' }))
        .toEqual({ action: 'ERROR', code: 'ALREADY_LINKED' });
    });

    it('no permite dos cuentas del mismo proveedor en un usuario', () => {
      expect(decideOidc({ mode: 'link', identityOwnerId: null, currentUserId: 'u1', emailOwnerId: null, currentHasProvider: true }))
        .toEqual({ action: 'ERROR', code: 'ALREADY_LINKED' });
    });
  });
});
