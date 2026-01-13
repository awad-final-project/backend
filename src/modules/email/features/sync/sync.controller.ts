import { Controller, Post, Param, Get, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { SyncService } from './sync.service';

@ApiTags('Email - Sync')
@ApiBearerAuth()
@Controller('email/sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('folder/:folder')
  @ApiOperation({ 
    summary: 'Sync emails from a folder to enable search and AI features',
    description: 'Syncs emails from Gmail/IMAP to local database for search and AI processing'
  })
  @ApiResponse({ status: 200, description: 'Returns sync statistics' })
  async syncFolder(
    @CurrentUser() user: { userId: string },
    @Param('folder') folder: string,
    @Query('limit') limit?: number,
  ) {
    const result = await this.syncService.syncFolder(
      user.userId,
      folder,
      limit ? parseInt(limit.toString(), 10) : 50,
    );
    return {
      message: 'Folder sync completed',
      ...result,
    };
  }

  @Post('all')
  @ApiOperation({ 
    summary: 'Sync all folders',
    description: 'Background sync of inbox, sent, and drafts folders'
  })
  @ApiResponse({ status: 200, description: 'Sync initiated' })
  async syncAll(@CurrentUser() user: { userId: string }) {
    // Run in background
    this.syncService.syncAllFolders(user.userId).catch((error) => {
      console.error('Background sync failed:', error);
    });
    return {
      message: 'Background sync initiated for all folders',
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Check sync status' })
  @ApiResponse({ status: 200, description: 'Returns sync status' })
  async getSyncStatus(
    @CurrentUser() user: { userId: string },
    @Query('folder') folder?: string,
  ) {
    const inProgress = this.syncService.isSyncInProgress(user.userId, folder);
    return {
      inProgress,
      message: inProgress
        ? 'Sync in progress'
        : 'No sync in progress',
    };
  }
}
