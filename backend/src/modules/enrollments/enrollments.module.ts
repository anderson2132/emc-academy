import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { PreEnrollmentsService } from './pre-enrollments.service';
import {
  AdminEnrollmentsController,
  AdminPreEnrollmentsController,
  EnrollmentsController,
  MePreEnrollmentsController,
} from './enrollments.controller';

@Module({
  controllers: [EnrollmentsController, AdminEnrollmentsController, AdminPreEnrollmentsController, MePreEnrollmentsController],
  providers: [EnrollmentsService, PreEnrollmentsService],
})
export class EnrollmentsModule {}
