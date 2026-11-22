import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { PreEnrollmentsService } from './pre-enrollments.service';
import { PaymentsService } from './payments.service';
import {
  AdminEnrollmentsController,
  AdminPaymentsController,
  AdminPreEnrollmentsController,
  MePreEnrollmentsController,
} from './enrollments.controller';

@Module({
  controllers: [AdminEnrollmentsController, AdminPaymentsController, AdminPreEnrollmentsController, MePreEnrollmentsController],
  providers: [EnrollmentsService, PreEnrollmentsService, PaymentsService],
})
export class EnrollmentsModule {}
