import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { PreEnrollmentsService } from './pre-enrollments.service';
import {
  AdminEnrollmentsController,
  AdminPreEnrollmentsController,
  MePreEnrollmentsController,
} from './enrollments.controller';

@Module({
  controllers: [AdminEnrollmentsController, AdminPreEnrollmentsController, MePreEnrollmentsController],
  providers: [EnrollmentsService, PreEnrollmentsService],
})
export class EnrollmentsModule {}
