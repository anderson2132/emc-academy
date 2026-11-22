import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { EnrollmentsService } from './enrollments.service';
import { PreEnrollmentsService } from './pre-enrollments.service';
import {
  ApproveEnrollmentDto,
  CreatePreEnrollmentDto,
  LinkPreEnrollmentDto,
  ListEnrollmentsQuery,
  ListPreEnrollmentsQuery,
  NotesDto,
  RequestEnrollmentDto,
} from './dto';
import { AllowInactive, CurrentUser, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';

/** Solicitudes de matrícula del alumno o del apoderado. */
@ApiTags('matrículas')
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Roles('STUDENT', 'GUARDIAN')
  @Post()
  request(@CurrentUser() user: AuthUser, @Body() dto: RequestEnrollmentDto, @Req() req: Request) {
    return this.enrollments.request(user, dto, req.ip);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.enrollments.mine(user);
  }

  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.enrollments.cancel(user, id, req.ip);
  }

  @Roles('GUARDIAN')
  @HttpCode(200)
  @Post(':id/guardian-approve')
  guardianApprove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.enrollments.guardianDecision(user, id, true, req.ip);
  }

  @Roles('GUARDIAN')
  @HttpCode(200)
  @Post(':id/guardian-reject')
  guardianReject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.enrollments.guardianDecision(user, id, false, req.ip);
  }
}

/** Revisión de solicitudes de matrícula (solo ADMIN). */
@ApiTags('admin · matrículas')
@Roles('ADMIN')
@Controller('admin/enrollments')
export class AdminEnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Get()
  list(@Query() q: ListEnrollmentsQuery) {
    return this.enrollments.list(q.status);
  }

  @HttpCode(200)
  @Post(':id/approve')
  approve(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveEnrollmentDto, @Req() req: Request) {
    return this.enrollments.approve(admin, id, dto, req.ip);
  }

  @HttpCode(200)
  @Post(':id/reject')
  reject(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NotesDto, @Req() req: Request) {
    return this.enrollments.reject(admin, id, dto.notes, req.ip);
  }
}

/** Prematrículas (solo ADMIN). */
@ApiTags('admin · prematrículas')
@Roles('ADMIN')
@Controller('admin/pre-enrollments')
export class AdminPreEnrollmentsController {
  constructor(private readonly pre: PreEnrollmentsService) {}

  @Get()
  list(@Query() q: ListPreEnrollmentsQuery) {
    return this.pre.list(q.status);
  }

  @Post()
  create(@CurrentUser() admin: AuthUser, @Body() dto: CreatePreEnrollmentDto, @Req() req: Request) {
    return this.pre.create(admin, dto, req.ip);
  }

  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.pre.cancel(admin, id, req.ip);
  }

  @HttpCode(200)
  @Post(':id/approve-claim')
  approveClaim(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.pre.approveClaim(admin, id, req.ip);
  }

  @HttpCode(200)
  @Post(':id/reject-claim')
  rejectClaim(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NotesDto, @Req() req: Request) {
    return this.pre.rejectClaim(admin, id, dto.notes, req.ip);
  }

  @HttpCode(200)
  @Post(':id/link')
  link(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkPreEnrollmentDto, @Req() req: Request) {
    return this.pre.linkManually(admin, id, dto.userId, req.ip);
  }
}

/** Prematrículas que el usuario puede confirmar (aunque su cuenta siga pendiente). */
@ApiTags('mi campus')
@Controller('me/pre-enrollments')
export class MePreEnrollmentsController {
  constructor(private readonly pre: PreEnrollmentsService) {}

  @AllowInactive()
  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.pre.mine(user);
  }

  @AllowInactive()
  @HttpCode(200)
  @Post(':id/claim')
  claim(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.pre.claim(user, id, req.ip);
  }
}
