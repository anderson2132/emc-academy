import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountRequestsController, AdminAccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [AuthModule],
  controllers: [AccountRequestsController, AdminAccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
