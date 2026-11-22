import { decideRoleChange, RoleChangeInput } from './role-change.policy';

const base = (over: Partial<RoleChangeInput> = {}): RoleChangeInput => ({
  action: 'ADD',
  role: 'ADMIN',
  actorId: 'admin-1',
  target: { id: 'user-2', status: 'ACTIVE', roles: ['TEACHER'] },
  activeAdminCount: 1,
  ...over,
});

describe('decideRoleChange', () => {
  it('dar rol a cuenta activa → permitido', () => {
    expect(decideRoleChange(base())).toEqual({ allowed: true });
  });

  it.each(['PENDING_APPROVAL', 'SUSPENDED', 'REJECTED'])('dar rol a cuenta %s → ACCOUNT_NOT_ACTIVE', (status) => {
    expect(decideRoleChange(base({ target: { id: 'user-2', status, roles: ['TEACHER'] } })))
      .toEqual({ allowed: false, reason: 'ACCOUNT_NOT_ACTIVE' });
  });

  it('dar un rol que ya tiene → ALREADY_HAS_ROLE', () => {
    expect(decideRoleChange(base({ role: 'TEACHER' }))).toEqual({ allowed: false, reason: 'ALREADY_HAS_ROLE' });
  });

  it('quitar un rol que no tiene → ROLE_NOT_ASSIGNED', () => {
    expect(decideRoleChange(base({ action: 'REMOVE', role: 'STUDENT' }))).toEqual({ allowed: false, reason: 'ROLE_NOT_ASSIGNED' });
  });

  it('quitar el único rol → LAST_ROLE', () => {
    expect(decideRoleChange(base({ action: 'REMOVE', role: 'TEACHER' }))).toEqual({ allowed: false, reason: 'LAST_ROLE' });
  });

  it('quitar un rol cuando tiene otros → permitido', () => {
    expect(decideRoleChange(base({ action: 'REMOVE', role: 'TEACHER', target: { id: 'user-2', status: 'ACTIVE', roles: ['TEACHER', 'STUDENT'] } })))
      .toEqual({ allowed: true });
  });

  it('un admin no se quita a sí mismo ADMIN → SELF_ADMIN_REMOVAL', () => {
    expect(decideRoleChange(base({
      action: 'REMOVE', role: 'ADMIN', activeAdminCount: 3,
      target: { id: 'admin-1', status: 'ACTIVE', roles: ['ADMIN', 'TEACHER'] },
    }))).toEqual({ allowed: false, reason: 'SELF_ADMIN_REMOVAL' });
  });

  it('quitar el último admin activo → LAST_ADMIN', () => {
    expect(decideRoleChange(base({
      action: 'REMOVE', role: 'ADMIN', activeAdminCount: 1,
      target: { id: 'user-2', status: 'ACTIVE', roles: ['ADMIN', 'TEACHER'] },
    }))).toEqual({ allowed: false, reason: 'LAST_ADMIN' });
  });

  it('quitar ADMIN a otro cuando hay más admins → permitido', () => {
    expect(decideRoleChange(base({
      action: 'REMOVE', role: 'ADMIN', activeAdminCount: 2,
      target: { id: 'user-2', status: 'ACTIVE', roles: ['ADMIN', 'TEACHER'] },
    }))).toEqual({ allowed: true });
  });

  it('quitar ADMIN a una cuenta suspendida no cuenta como último admin activo', () => {
    expect(decideRoleChange(base({
      action: 'REMOVE', role: 'ADMIN', activeAdminCount: 1,
      target: { id: 'user-2', status: 'SUSPENDED', roles: ['ADMIN', 'TEACHER'] },
    }))).toEqual({ allowed: true });
  });
});
