import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../libs/guards/jwt-auth.guard';
import { CurrentUser } from '../../../../libs/decorators';
import { MailboxService } from './mailbox.service';

@ApiTags('Mailbox')
@Controller('emails/mailboxes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MailboxController {
  constructor(private readonly mailboxService: MailboxService) {}

  @Get()
  @ApiOperation({ summary: 'Get all mailboxes with unread counts' })
  async getMailboxes(@CurrentUser() user: { userId: string }) {
    return this.mailboxService.getMailboxes(user.userId);
  }
}
