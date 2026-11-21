import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AcademicService } from './academic.service';
import { AssignUserDto, CreateGroupDto } from './dto';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';

/** Administración de cursos, grupos, docentes y matrículas (solo ADMIN). */
@ApiTags('admin · académico')
@Roles('ADMIN')
@Controller('admin')
export class AdminAcademicController {
  constructor(private readonly academic: AcademicService) {}

  @Get('courses')
  courses() {
    return this.academic.listCourses();
  }

  @Get('groups')
  groups() {
    return this.academic.listGroups();
  }

  @Post('groups')
  createGroup(@CurrentUser() admin: AuthUser, @Body() dto: CreateGroupDto, @Req() req: Request) {
    return this.academic.createGroup(admin, dto, req.ip);
  }

  @Get('groups/:id')
  group(@Param('id', ParseUUIDPipe) id: string) {
    return this.academic.groupDetail(id);
  }

  @HttpCode(200)
  @Post('groups/:id/teachers')
  assignTeacher(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignUserDto, @Req() req: Request) {
    return this.academic.assignTeacher(admin, id, dto.userId, req.ip);
  }

  @Delete('groups/:id/teachers/:userId')
  removeTeacher(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string, @Req() req: Request) {
    return this.academic.removeTeacher(admin, id, userId, req.ip);
  }

  @HttpCode(200)
  @Post('groups/:id/students')
  enroll(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignUserDto, @Req() req: Request) {
    return this.academic.enrollStudent(admin, id, dto.userId, req.ip);
  }

  @Delete('groups/:id/students/:userId')
  unenroll(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string, @Req() req: Request) {
    return this.academic.unenrollStudent(admin, id, userId, req.ip);
  }
}

/** Lo propio del usuario: cursos del alumno y grupos del docente. */
@ApiTags('mi campus')
@Controller('me')
export class MeAcademicController {
  constructor(private readonly academic: AcademicService) {}

  @Get('courses')
  courses(@CurrentUser() user: AuthUser) {
    return this.academic.myCourses(user);
  }

  @Get('groups')
  groups(@CurrentUser() user: AuthUser) {
    return this.academic.myGroups(user);
  }
}
