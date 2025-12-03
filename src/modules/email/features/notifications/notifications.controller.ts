import { Controller, Post, Delete, UseGuards, Body } from '@nestjs/common';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { GmailPushService } from './gmail-push.service';

@Controller('email/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly gmailPushService: GmailPushService) {}

  @Post('watch')
  async setupWatch(@CurrentUser() user: any) {
    return this.gmailPushService.setupWatch(user.sub);
  }

  @Delete('watch')
  async stopWatch(@CurrentUser() user: any) {
    await this.gmailPushService.stopWatch(user.sub);
    return { message: 'Push notifications stopped successfully' };
  }

  @Post('webhook')
  async handleWebhook(@Body() notification: any) {
    // This endpoint receives Pub/Sub push notifications from Google
    await this.gmailPushService.processNotification(notification);
    return { success: true };
  }
}
