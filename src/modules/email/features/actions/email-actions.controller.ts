import {
  Controller,
  Patch,
  Delete,
  Param,
  Body,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { ModifyEmailDto } from '@app/libs/dtos';
import { EmailActionsService } from './email-actions.service';

@ApiTags('Email Actions')
@Controller('emails')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmailActionsController {
  constructor(private readonly emailActionsService: EmailActionsService) {}

  @Patch(':id/star')
  @ApiOperation({ summary: 'Toggle star status of an email' })
  async toggleStar(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.emailActionsService.toggleStar(user.userId, id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark email as read/unread' })
  async markAsRead(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body('isRead') isRead: boolean,
  ) {
    return this.emailActionsService.markAsRead(user.userId, id, isRead);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an email' })
  async deleteEmail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.emailActionsService.deleteEmail(user.userId, id);
  }

  @Post(':id/modify')
  @ApiOperation({ summary: 'Modify email properties' })
  async modifyEmail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() data: ModifyEmailDto,
  ) {
    return this.emailActionsService.modifyEmail(user.userId, id, data);
  }

  @Post('bulk/delete')
  @ApiOperation({ summary: 'Bulk delete multiple emails' })
  async bulkDelete(
    @CurrentUser() user: { userId: string },
    @Body('emailIds') emailIds: string[],
  ) {
    return this.emailActionsService.bulkDelete(user.userId, emailIds);
  }

  @Post('bulk/star')
  @ApiOperation({ summary: 'Bulk star/unstar emails' })
  async bulkToggleStar(
    @CurrentUser() user: { userId: string },
    @Body('emailIds') emailIds: string[],
    @Body('star') star: boolean,
  ) {
    return this.emailActionsService.bulkToggleStar(user.userId, emailIds, star);
  }

  @Post('bulk/read')
  @ApiOperation({ summary: 'Bulk mark emails as read/unread' })
  async bulkMarkAsRead(
    @CurrentUser() user: { userId: string },
    @Body('emailIds') emailIds: string[],
    @Body('isRead') isRead: boolean,
  ) {
    return this.emailActionsService.bulkMarkAsRead(user.userId, emailIds, isRead);
  }
}
