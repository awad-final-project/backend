import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EmailService } from './email.service';
import { JwtAuthGuard } from '../../libs/guards/jwt-auth.guard';
import { CurrentUser } from '../../libs/decorators';
import { SendEmailDto, ReplyEmailDto, ModifyEmailDto } from '../../libs/dtos';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get('mailboxes')
  async getMailboxes(@CurrentUser() user: { userId: string }) {
    return this.emailService.getMailboxes(user.userId);
  }

  @Get('mailboxes/:id/emails')
  async getEmailsByMailbox(
    @CurrentUser() user: { userId: string },
    @Param('id') mailboxId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.emailService.getEmailsByFolder(
      user.userId,
      mailboxId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('emails/:id')
  async getEmailById(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.emailService.getEmailById(user.userId, id);
  }

  @Post('emails/send')
  async sendEmail(
    @CurrentUser() user: { userId: string; email: string },
    @Body() data: SendEmailDto,
  ) {
    return this.emailService.sendEmail(user.userId, user.email, data);
  }

  @Post('emails/:id/reply')
  async replyEmail(
    @CurrentUser() user: { userId: string; email: string },
    @Param('id') id: string,
    @Body() data: ReplyEmailDto,
  ) {
    return this.emailService.replyEmail(user.userId, user.email, id, data);
  }

  @Post('emails/:id/modify')
  async modifyEmail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() data: ModifyEmailDto,
  ) {
    return this.emailService.modifyEmail(user.userId, id, data);
  }

  // Legacy endpoints for backward compatibility
  @Get('emails/mailboxes')
  async getMailboxesLegacy(@CurrentUser() user: { userId: string }) {
    return this.emailService.getMailboxes(user.userId);
  }

  @Get('emails/folder/:folder')
  async getEmailsByFolderLegacy(
    @CurrentUser() user: { userId: string },
    @Param('folder') folder: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.emailService.getEmailsByFolder(
      user.userId,
      folder,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Patch('emails/:id/star')
  async toggleStar(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.emailService.toggleStar(user.userId, id);
  }

  @Patch('emails/:id/read')
  async markAsRead(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body('isRead') isRead: boolean,
  ) {
    return this.emailService.markAsRead(user.userId, id, isRead);
  }

  @Delete('emails/:id')
  async deleteEmail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.emailService.deleteEmail(user.userId, id);
  }

  @Post('emails/seed')
  async seedMockEmails(@CurrentUser() user: { userId: string; email: string }) {
    return this.emailService.seedMockEmails(user.userId, user.email);
  }
}
