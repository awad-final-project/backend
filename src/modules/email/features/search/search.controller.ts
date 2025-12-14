import { Controller, Get, Query, UseGuards, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { SearchService } from './search.service';

@ApiTags('Email - Search')
@Controller('emails/search')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search emails with fuzzy, partial, and semantic matching' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'folder', required: false, description: 'Filter by folder' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of results' })
  @ApiQuery({ name: 'semantic', required: false, description: 'Include semantic search' })
  async search(
    @CurrentUser() user: { userId: string },
    @Query('q') query: string,
    @Query('folder') folder?: string,
    @Query('limit') limit?: string,
    @Query('semantic') semantic?: string,
  ) {
    const results = await this.searchService.search({
      query,
      userId: user.userId,
      folder,
      limit: limit ? parseInt(limit, 10) : 50,
      includeSemantic: semantic !== 'false',
    });

    return {
      results: results.map((r) => ({
        email: {
          id: r.email.id,
          from: r.email.from,
          to: r.email.to,
          subject: r.email.subject,
          preview: r.email.preview,
          body: r.email.body,
          isRead: r.email.isRead,
          isStarred: r.email.isStarred,
          sentAt: r.email.sentAt,
          folder: r.email.folder,
          hasAttachments: r.email.hasAttachments,
          attachments: r.email.attachments,
          labels: r.email.labels,
          priority: r.email.priority,
        },
        relevanceScore: r.relevanceScore,
        matchType: r.matchType,
      })),
      total: results.length,
      query,
    };
  }

  @Get('suggestions/contacts')
  @ApiOperation({ summary: 'Get contact suggestions for autocomplete' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of suggestions' })
  async getContactSuggestions(
    @CurrentUser() user: { userId: string },
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    const suggestions = await this.searchService.getContactSuggestions(
      user.userId,
      query,
      limit ? parseInt(limit, 10) : 10,
    );

    return {
      suggestions,
      type: 'contacts',
    };
  }

  @Get('suggestions/keywords')
  @ApiOperation({ summary: 'Get keyword suggestions for autocomplete' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum number of suggestions' })
  async getKeywordSuggestions(
    @CurrentUser() user: { userId: string },
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    const suggestions = await this.searchService.getKeywordSuggestions(
      user.userId,
      query,
      limit ? parseInt(limit, 10) : 10,
    );

    return {
      suggestions,
      type: 'keywords',
    };
  }

  @Post('generate-embeddings/:emailId')
  @ApiOperation({ summary: 'Generate and store embeddings for an email' })
  async generateEmbeddings(
    @CurrentUser() user: { userId: string },
    @Param('emailId') emailId: string,
  ) {
    await this.searchService.generateEmailEmbeddings(emailId);
    return { message: 'Embeddings generated successfully' };
  }
}

