import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { SendEmailDto, ReplyEmailDto } from '@app/libs/dtos';
import { ComposeService } from './compose.service';

@ApiTags('Compose')
@Controller('emails')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ComposeController {
  constructor(private readonly composeService: ComposeService) {}

  @Post('send')
  @ApiOperation({ summary: 'Send an email with optional attachments' })
  async sendEmail(
    @CurrentUser() user: { userId: string; email: string },
    @Body() data: SendEmailDto,
  ) {
    return this.composeService.sendEmail(user.userId, user.email, data);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Reply to an email' })
  async replyEmail(
    @CurrentUser() user: { userId: string; email: string },
    @Param('id') id: string,
    @Body() data: ReplyEmailDto,
  ) {
    return this.composeService.replyToEmail(user.userId, user.email, id, data);
  }
}
