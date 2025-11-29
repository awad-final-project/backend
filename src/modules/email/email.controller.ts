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

@Controller('emails')
@UseGuards(JwtAuthGuard)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get('mailboxes')
  async getMailboxes(@CurrentUser() user: { userId: string }) {
    return this.emailService.getMailboxes(user.userId);
  }

  @Get('folder/:folder')
  async getEmailsByFolder(
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

  @Get(':id')
  async getEmailById(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.emailService.getEmailById(user.userId, id);
  }

  @Post('send')
  async sendEmail(
    @CurrentUser() user: { userId: string; email: string },
    @Body() data: SendEmailDto,
  ) {
    return this.emailService.sendEmail(user.userId, user.email, data);
  }

  @Post(':id/reply')
  async replyEmail(
    @CurrentUser() user: { userId: string; email: string },
    @Param('id') id: string,
    @Body() data: ReplyEmailDto,
  ) {
    return this.emailService.replyEmail(user.userId, user.email, id, data);
  }

  @Post(':id/modify')
  async modifyEmail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() data: ModifyEmailDto,
  ) {
    return this.emailService.modifyEmail(user.userId, id, data);
  }

  @Patch(':id/star')
  async toggleStar(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.emailService.toggleStar(user.userId, id);
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body('isRead') isRead: boolean,
  ) {
    return this.emailService.markAsRead(user.userId, id, isRead);
  }

  @Delete(':id')
  async deleteEmail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.emailService.deleteEmail(user.userId, id);
  }

  @Post('seed')
  async seedMockEmails(@CurrentUser() user: { userId: string; email: string }) {
    return this.emailService.seedMockEmails(user.userId, user.email);
  }
}
