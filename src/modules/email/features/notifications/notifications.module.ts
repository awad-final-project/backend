import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { GmailPushService } from './gmail-push.service';
import { EmailProvidersModule } from '@email/providers/email-providers.module';

@Module({
  imports: [EmailProvidersModule],
  controllers: [NotificationsController],
  providers: [GmailPushService],
  exports: [GmailPushService],
})
export class NotificationsModule {}
