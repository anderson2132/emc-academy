import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AcademicService } from './academic.service';
import { AssignUserDto, CreateGroupDto, DeleteDto, UpdateCourseDto, UpdateGroupDto } from './dto';
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

  @Get('courses/:id')
  course(@Param('id', ParseUUIDPipe) id: string) {
    return this.academic.courseDetail(id);
  }

  @Patch('courses/:id')
  updateCourse(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCourseDto, @Req() req: Request) {
    return this.academic.updateCourse(admin, id, dto, req.ip);
  }

  @Get('groups')
  groups() {
    return this.academic.listGroups();
  }

  @Patch('groups/:id')
  updateGroup(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGroupDto, @Req() req: Request) {
    return this.academic.updateGroup(admin, id, dto, req.ip);
  }

  @Get('groups/:id/deletion-impact')
  groupImpact(@Param('id', ParseUUIDPipe) id: string) {
    return this.academic.groupDeletionImpact(id);
  }

  @HttpCode(200)
  @Post('groups/:id/delete')
  deleteGroup(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeleteDto, @Req() req: Request) {
    return this.academic.deleteGroup(admin, id, dto, req.ip);
  }

  @Get('courses/:id/deletion-impact')
  courseImpact(@Param('id', ParseUUIDPipe) id: string) {
    return this.academic.courseDeletionImpact(id);
  }

  @HttpCode(200)
  @Post('courses/:id/delete')
  deleteCourse(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeleteDto, @Req() req: Request) {
    return this.academic.deleteCourse(admin, id, dto, req.ip);
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
