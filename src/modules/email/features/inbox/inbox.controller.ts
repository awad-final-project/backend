import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { ParseObjectIdPipe } from '@app/libs/utils';
import { EmailFilters, InboxService } from './inbox.service';

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
    @Query('hasAttachments') hasAttachments?: string,
    @Query('sort') sort?: 'newest' | 'oldest' | 'sender-asc' | 'sender-desc',
  ) {
    const filters = this.parseFilters({
      search,
      from,
      unread,
      starred,
      startDate,
      endDate,
      hasAttachments,
      sort,
    });

    return this.inboxService.getEmailsByFolder(
      user.userId,
      folder,
      parseInt(page, 10),
      parseInt(limit, 10),
      filters,
    );
  }

  @Get('folder/:folder/ids')
  @ApiOperation({ summary: 'Get all email IDs for the current filters' })
  async getEmailIdsForFolder(
    @CurrentUser() user: { userId: string },
    @Param('folder') folder: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('unread') unread?: string,
    @Query('starred') starred?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('hasAttachments') hasAttachments?: string,
    @Query('sort') sort?: 'newest' | 'oldest' | 'sender-asc' | 'sender-desc',
  ) {
    const filters = this.parseFilters({
      search,
      from,
      unread,
      starred,
      startDate,
      endDate,
      hasAttachments,
      sort,
    });

    return this.inboxService.getEmailIdsForSelection(user.userId, folder, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get email by ID with full details' })
  async getEmailById(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.inboxService.getEmailById(user.userId, id);
  }

  private parseFilters(query: {
    search?: string;
    from?: string;
    unread?: string;
    starred?: string;
    startDate?: string;
    endDate?: string;
    hasAttachments?: string;
    sort?: string;
  }): EmailFilters {
    const allowedSorts: EmailFilters['sort'][] = ['newest', 'oldest', 'sender-asc', 'sender-desc'];
    const normalizedSort = allowedSorts.includes(query.sort as EmailFilters['sort'])
      ? (query.sort as EmailFilters['sort'])
      : undefined;

    return {
      search: query.search,
      from: query.from,
      unread: query.unread === 'true' ? true : undefined,
      starred: query.starred === 'true' ? true : undefined,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      hasAttachments: query.hasAttachments === 'true' ? true : undefined,
      sort: normalizedSort,
    };
  }
}
