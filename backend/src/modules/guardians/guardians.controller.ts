import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { GuardiansService } from './guardians.service';
import { AddGuardianDto, AuthorizeLinkDto, CreateChildDto, LinkReasonDto, ListLinksQuery } from './dto';
import { AllowInactive, CurrentUser, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';

/** Apoderado: sus hijos (solo lectura) y los vínculos por autorizar. */
@ApiTags('apoderado')
@Roles('GUARDIAN')
@Controller('me/children')
export class MyChildrenController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.guardians.children(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateChildDto, @Req() req: Request) {
    return this.guardians.createChild(user, dto, req.ip);
  }

  @HttpCode(200)
  @Post(':studentId/authorize')
  authorize(@CurrentUser() user: AuthUser, @Param('studentId', ParseUUIDPipe) studentId: string, @Body() dto: AuthorizeLinkDto, @Req() req: Request) {
    return this.guardians.authorize(user, studentId, dto, req.ip);
  }

  @HttpCode(200)
  @Post(':studentId/decline')
  decline(@CurrentUser() user: AuthUser, @Param('studentId', ParseUUIDPipe) studentId: string, @Req() req: Request) {
    return this.guardians.decline(user, studentId, req.ip);
  }
}

/** Alumno: sus apoderados. Disponible aunque la cuenta siga pendiente (el menor lo indica al registrarse). */
@ApiTags('mi campus')
@Controller('me/guardians')
export class MyGuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @AllowInactive()
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.guardians.myGuardians(user);
  }

  @AllowInactive()
  @Post()
  add(@CurrentUser() user: AuthUser, @Body() dto: AddGuardianDto, @Req() req: Request) {
    return this.guardians.addGuardian(user, dto.email, req.ip);
  }
}

/** Revisión de vínculos apoderado–alumno (solo ADMIN). */
@ApiTags('admin · apoderados')
@Roles('ADMIN')
@Controller('admin/guardian-links')
export class AdminGuardianLinksController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get()
  list(@Query() q: ListLinksQuery) {
    return this.guardians.listLinks(q.status);
  }

  @HttpCode(200)
  @Post(':studentId/:guardianId/approve')
  approve(
    @CurrentUser() admin: AuthUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
    @Req() req: Request,
  ) {
    return this.guardians.approveLink(admin, studentId, guardianId, req.ip);
  }

  @HttpCode(200)
  @Post(':studentId/:guardianId/revoke')
  revoke(
    @CurrentUser() admin: AuthUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
    @Body() dto: LinkReasonDto,
    @Req() req: Request,
  ) {
    return this.guardians.revokeLink(admin, studentId, guardianId, dto.reason, req.ip);
  }
}
