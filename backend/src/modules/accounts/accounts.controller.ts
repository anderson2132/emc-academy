import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccountsService } from './accounts.service';
import { ApproveRequestDto, ChangeRoleDto, CreateAccountRequestDto, ListRequestsQuery, ListUsersQuery, ReasonDto, ReviewDto } from './dto';
import { AllowInactive, CurrentUser, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';

/** Solicitudes de cuenta del propio usuario. */
@ApiTags('cuentas')
@Controller('account-requests')
export class AccountRequestsController {
  constructor(private readonly accounts: AccountsService) {}

  @AllowInactive()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountRequestDto) {
    return this.accounts.createRequest(user, dto);
  }

  @AllowInactive()
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.accounts.myRequests(user.id);
  }
}

/** Administración de solicitudes y usuarios (solo ADMIN). */
@ApiTags('admin · cuentas')
@Roles('ADMIN')
@Controller('admin')
export class AdminAccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('account-requests')
  list(@Query() q: ListRequestsQuery) {
    return this.accounts.listRequests(q.status);
  }

  @HttpCode(200)
  @Post('account-requests/:id/approve')
  approve(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveRequestDto, @Req() req: Request) {
    return this.accounts.approve(admin, id, dto.notes, dto.role, req.ip);
  }

  @HttpCode(200)
  @Post('account-requests/:id/reject')
  reject(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto, @Req() req: Request) {
    return this.accounts.reject(admin, id, dto.notes, req.ip);
  }

  @Get('users')
  users(@Query() q: ListUsersQuery) {
    return this.accounts.listUsers(q.status, q.q, q.role);
  }

  @HttpCode(200)
  @Post('users/:id/suspend')
  suspend(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Req() req: Request) {
    return this.accounts.suspend(admin, id, dto.reason, req.ip);
  }

  @HttpCode(200)
  @Post('users/:id/roles')
  addRole(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeRoleDto, @Req() req: Request) {
    return this.accounts.addRole(admin, id, dto.role, dto.reason, req.ip);
  }

  @HttpCode(200)
  @Post('users/:id/roles/remove')
  removeRole(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeRoleDto, @Req() req: Request) {
    return this.accounts.removeRole(admin, id, dto.role, dto.reason, req.ip);
  }

  @HttpCode(200)
  @Post('users/:id/reactivate')
  reactivate(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Req() req: Request) {
    return this.accounts.reactivate(admin, id, dto.reason, req.ip);
  }
}
