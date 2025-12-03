import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { InboxService } from './inbox.service';

@ApiTags('Inbox')
@Controller('emails')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get('folder/:folder')
  @ApiOperation({ summary: 'Get emails by folder with optional search and filters' })
  async getEmailsByFolder(
    @CurrentUser() user: { userId: string },
    @Param('folder') folder: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('unread') unread?: string,
    @Query('starred') starred?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.inboxService.getEmailsByFolder(
      user.userId,
      folder,
      parseInt(page, 10),
      parseInt(limit, 10),
      {
        search,
        from,
        unread: unread === 'true',
        starred: starred === 'true',
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get email by ID with full details' })
  async getEmailById(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.inboxService.getEmailById(user.userId, id);
  }
}
