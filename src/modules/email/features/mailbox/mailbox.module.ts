import { Module } from '@nestjs/common';
import { EmailProvidersModule } from '@email/providers/email-providers.module';
import { MailboxController } from './mailbox.controller';
import { MailboxService } from './mailbox.service';

@Module({
  imports: [EmailProvidersModule],
  controllers: [MailboxController],
  providers: [MailboxService],
  exports: [MailboxService],
})
export class MailboxModule {}
