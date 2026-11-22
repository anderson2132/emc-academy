import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module';
import { GuardiansService } from './guardians.service';
import { AdminGuardianLinksController, MyChildrenController, MyGuardiansController } from './guardians.controller';

@Module({
  imports: [AcademicModule],
  controllers: [MyChildrenController, MyGuardiansController, AdminGuardianLinksController],
  providers: [GuardiansService],
})
export class GuardiansModule {}
