import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { EmailUtilsService } from './email-utils.service';

@ApiTags('Email Utils')
@Controller('emails')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmailUtilsController {
  constructor(private readonly emailUtilsService: EmailUtilsService) {}

  @Post('seed')
  @ApiOperation({ summary: 'Seed mock emails for testing' })
  async seedMockEmails(@CurrentUser() user: { userId: string; email: string }) {
    return this.emailUtilsService.seedMockEmails(user.userId, user.email);
  }
}
