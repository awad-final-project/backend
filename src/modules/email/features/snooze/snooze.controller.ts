import { Controller, Post, Get, Delete, Body, Param, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { SnoozeService } from './snooze.service';
import { SnoozeEmailDto, SnoozeEmailPresetDto, SnoozePreset } from '@app/libs/dtos';
import { EmailModel } from '@database/models';

@ApiTags('Email - Snooze')
@ApiBearerAuth()
@Controller('email/snooze')
@UseGuards(JwtAuthGuard)
export class SnoozeController {
  constructor(
    private readonly snoozeService: SnoozeService,
    private readonly emailModel: EmailModel,
  ) {}

  @Post(':emailId')
  @ApiOperation({ summary: 'Snooze an email until a specific date/time' })
  @ApiResponse({ status: 200, description: 'Email snoozed successfully' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async snoozeEmail(
    @CurrentUser() user: { userId: string },
    @Param('emailId') emailId: string,
    @Body() dto: SnoozeEmailDto,
  ) {
    const snoozeUntil = new Date(dto.snoozeUntil);
    
    if (isNaN(snoozeUntil.getTime())) {
      throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
    }
    
    if (snoozeUntil <= new Date()) {
      throw new HttpException('Snooze time must be in the future', HttpStatus.BAD_REQUEST);
    }

    const email = await this.emailModel.findById(emailId);
    if (!email) {
      throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
    }
    if (email.accountId.toString() !== user.userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    await this.snoozeService.snoozeEmail(emailId, snoozeUntil);

    return { 
      message: 'Email snoozed successfully',
      snoozeUntil 
    };
  }

  @Post(':emailId/preset')
  @ApiOperation({ summary: 'Snooze an email using preset options' })
  @ApiResponse({ status: 200, description: 'Email snoozed successfully' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async snoozeEmailPreset(
    @CurrentUser() user: { userId: string },
    @Param('emailId') emailId: string,
    @Body() dto: SnoozeEmailPresetDto,
  ) {
    let snoozeUntil: Date;
    const now = new Date();
    const currentHour = now.getHours();

    switch (dto.preset) {
      case SnoozePreset.LATER_TODAY:
        // Smart logic based on current time:
        // - Before 3 PM (15:00): Snooze to 6 PM today
        // - After 3 PM: Snooze to 9 AM tomorrow
        snoozeUntil = new Date(now);
        if (currentHour < 15) {
          snoozeUntil.setHours(18, 0, 0, 0); // 6 PM today
        } else {
          snoozeUntil.setDate(snoozeUntil.getDate() + 1);
          snoozeUntil.setHours(9, 0, 0, 0); // 9 AM tomorrow
        }
        break;

      case SnoozePreset.TOMORROW:
        snoozeUntil = new Date(now);
        snoozeUntil.setDate(snoozeUntil.getDate() + 1);
        snoozeUntil.setHours(9, 0, 0, 0); // 9 AM tomorrow
        break;

      case SnoozePreset.THIS_WEEKEND:
        snoozeUntil = new Date(now);
        const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
        
        // If it's already weekend (Fri evening, Sat, or Sun), go to next weekend
        if (currentDay === 6 || currentDay === 0 || (currentDay === 5 && currentHour >= 15)) {
          // Next Saturday
          const daysUntilNextSaturday = currentDay === 0 ? 6 : (13 - currentDay);
          snoozeUntil.setDate(snoozeUntil.getDate() + daysUntilNextSaturday);
        } else {
          // This Saturday
          const daysUntilSaturday = (6 - currentDay + 7) % 7;
          snoozeUntil.setDate(snoozeUntil.getDate() + daysUntilSaturday);
        }
        snoozeUntil.setHours(9, 0, 0, 0); // 9 AM Saturday
        break;

      case SnoozePreset.NEXT_WEEK:
        snoozeUntil = new Date(now);
        const daysUntilNextMonday = ((8 - now.getDay()) % 7) || 7;
        snoozeUntil.setDate(snoozeUntil.getDate() + daysUntilNextMonday);
        snoozeUntil.setHours(9, 0, 0, 0); // 9 AM next Monday
        break;

      case SnoozePreset.CUSTOM:
        if (!dto.customDate) {
          throw new HttpException(
            'Custom date is required for CUSTOM preset',
            HttpStatus.BAD_REQUEST,
          );
        }
        snoozeUntil = new Date(dto.customDate);
        if (isNaN(snoozeUntil.getTime())) {
          throw new HttpException('Invalid custom date format', HttpStatus.BAD_REQUEST);
        }
        break;

      default:
        throw new HttpException('Invalid preset', HttpStatus.BAD_REQUEST);
    }

    if (snoozeUntil <= now) {
      throw new HttpException('Snooze time must be in the future', HttpStatus.BAD_REQUEST);
    }

    const email = await this.emailModel.findById(emailId);
    if (!email) {
      throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
    }
    if (email.accountId.toString() !== user.userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    await this.snoozeService.snoozeEmail(emailId, snoozeUntil);

    return { 
      message: 'Email snoozed successfully',
      snoozeUntil 
    };
  }

  @Delete(':emailId')
  @ApiOperation({ summary: 'Unsnooze an email (manually bring it back)' })
  @ApiResponse({ status: 200, description: 'Email unsnoozed successfully' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async unsnoozeEmail(
    @CurrentUser() user: { userId: string },
    @Param('emailId') emailId: string,
  ) {
    const email = await this.emailModel.findById(emailId);
    if (!email) {
      throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
    }
    if (email.accountId.toString() !== user.userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    await this.snoozeService.unsnoozeEmail(emailId);
    return { message: 'Email unsnoozed successfully' };
  }

  @Get()
  @ApiOperation({ summary: 'Get all snoozed emails' })
  @ApiResponse({ status: 200, description: 'Returns all snoozed emails for the user' })
  async getSnoozedEmails(@CurrentUser() user: { userId: string }) {
    const snoozedEmails = await this.snoozeService.getSnoozedEmails(user.userId);
    
    return {
      emails: snoozedEmails.map((email) => ({
        id: email._id,
        from: email.from,
        to: email.to,
        subject: email.subject,
        preview: email.preview,
        isRead: email.isRead,
        isStarred: email.isStarred,
        sentAt: email.sentAt,
        snoozeUntil: email.snoozeUntil,
        snoozedAt: email.snoozedAt,
      })),
      total: snoozedEmails.length,
    };
  }
}
