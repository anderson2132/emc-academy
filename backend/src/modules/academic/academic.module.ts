import { Module } from '@nestjs/common';
import { AcademicService } from './academic.service';
import { AdminAcademicController, MeAcademicController } from './academic.controller';

@Module({
  controllers: [AdminAcademicController, MeAcademicController],
  providers: [AcademicService],
})
export class AcademicModule {}
