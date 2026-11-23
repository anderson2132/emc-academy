import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { AdminSessionsController, MySessionsController } from './sessions.controller';

@Module({
  controllers: [AdminSessionsController, MySessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
