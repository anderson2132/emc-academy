import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SessionsService } from './sessions.service';
import { GenerateSessionsDto, ReasonDto, SessionDto, SetAttendanceDto } from './dto';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';

/** Programación de clases y corrección de asistencia (solo ADMIN). */
@ApiTags('admin · clases y asistencia')
@Roles('ADMIN')
@Controller('admin')
export class AdminSessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** Clases del grupo + asistencia por alumno (% y detalle por clase). */
  @Get('groups/:id/sessions')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.listForGroup(id);
  }

  @HttpCode(200)
  @Post('groups/:id/sessions/generate')
  generate(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateSessionsDto, @Req() req: Request) {
    return this.sessions.generate(admin, id, dto, req.ip);
  }

  @Post('groups/:id/sessions')
  add(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SessionDto, @Req() req: Request) {
    return this.sessions.addOne(admin, id, dto, req.ip);
  }

  @Patch('sessions/:sid')
  update(@CurrentUser() admin: AuthUser, @Param('sid', ParseUUIDPipe) sid: string, @Body() dto: SessionDto, @Req() req: Request) {
    return this.sessions.update(admin, sid, dto, req.ip);
  }

  @HttpCode(200)
  @Post('sessions/:sid/cancel')
  cancel(@CurrentUser() admin: AuthUser, @Param('sid', ParseUUIDPipe) sid: string, @Body() dto: ReasonDto, @Req() req: Request) {
    return this.sessions.setCancelled(admin, sid, true, dto.reason, req.ip);
  }

  @HttpCode(200)
  @Post('sessions/:sid/restore')
  restore(@CurrentUser() admin: AuthUser, @Param('sid', ParseUUIDPipe) sid: string, @Body() dto: ReasonDto, @Req() req: Request) {
    return this.sessions.setCancelled(admin, sid, false, dto.reason, req.ip);
  }

  @Delete('sessions/:sid')
  remove(@CurrentUser() admin: AuthUser, @Param('sid', ParseUUIDPipe) sid: string, @Req() req: Request) {
    return this.sessions.remove(admin, sid, req.ip);
  }

  @HttpCode(200)
  @Post('sessions/:sid/attendance/:studentId')
  setAttendance(
    @CurrentUser() admin: AuthUser,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: SetAttendanceDto,
    @Req() req: Request,
  ) {
    return this.sessions.setAttendance(admin, sid, studentId, dto.status, dto.reason, req.ip);
  }
}

/** Calendario y asistencia del propio usuario. */
@ApiTags('mi campus')
@Controller('me')
export class MySessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** Alumno: sus clases, su asistencia y su %. */
  @Roles('STUDENT')
  @Get('calendar')
  calendar(@CurrentUser() user: AuthUser) {
    return this.sessions.studentCalendar(user);
  }

  /** Alumno: marcar asistencia (±10 min del inicio). */
  @Roles('STUDENT')
  @HttpCode(200)
  @Post('sessions/:sid/attendance')
  mark(@CurrentUser() user: AuthUser, @Param('sid', ParseUUIDPipe) sid: string, @Req() req: Request) {
    return this.sessions.mark(user, sid, req.ip);
  }

  /** Docente: calendario de sus grupos. */
  @Roles('TEACHER')
  @Get('teaching-calendar')
  teaching(@CurrentUser() user: AuthUser) {
    return this.sessions.teacherCalendar(user);
  }

  /** Docente: lista de asistencia de una clase de su grupo. */
  @Roles('TEACHER')
  @Get('teaching-sessions/:sid/attendance')
  teachingAttendance(@CurrentUser() user: AuthUser, @Param('sid', ParseUUIDPipe) sid: string) {
    return this.sessions.sessionAttendanceForTeacher(user, sid);
  }

  /** Apoderado: calendario y asistencia de un hijo vinculado. */
  @Roles('GUARDIAN')
  @Get('children/:studentId/calendar')
  childCalendar(@CurrentUser() user: AuthUser, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.sessions.childCalendar(user, studentId);
  }
}
