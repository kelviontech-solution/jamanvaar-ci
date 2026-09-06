import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/** Global so any module can send a transactional email without a per-module import. */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService]
})
export class NotificationsModule {}
