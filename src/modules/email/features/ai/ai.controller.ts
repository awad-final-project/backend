import { Controller, Post, Param, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { AiService } from './ai.service';
import { EmailModel } from '@database/models';
import { EmailProviderFactory } from '@email/providers/email-provider.factory';
import { SyncService } from '@email/features/sync/sync.service';
import { isValidObjectId } from 'mongoose';

@ApiTags('Email - AI')
@ApiBearerAuth()
@Controller('email/ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly emailModel: EmailModel,
    private readonly providerFactory: EmailProviderFactory,
    private readonly syncService: SyncService,
  ) {}

  @Post('summarize/:emailId')
  @ApiOperation({ summary: 'Generate AI summary of an email using Gemini' })
  @ApiResponse({ status: 200, description: 'Returns email summary' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  @ApiResponse({ status: 503, description: 'AI service unavailable' })
  async summarizeEmail(
    @CurrentUser() user: { userId: string },
    @Param('emailId') emailId: string,
  ) {
    // Try to get cached summary from database first
    // Build query conditionally - only include _id if emailId is valid ObjectId
    const orConditions: any[] = [
      { gmailMessageId: emailId }, // Gmail: Gmail message ID
      { imapMessageId: emailId }, // IMAP: IMAP message ID
    ];
    
    if (isValidObjectId(emailId)) {
      orConditions.unshift({ _id: emailId }); // Local mail: MongoDB ObjectID
    }
    
    const dbEmail = await this.emailModel.findOne({
      $or: orConditions,
      accountId: user.userId,
    });

    // Check if summary already exists in cache
    if (dbEmail?.aiSummary) {
      return {
        summary: dbEmail.aiSummary,
        summarizedAt: dbEmail.summarizedAt,
        cached: true,
      };
    }

    // If not cached, fetch from provider
    const provider = await this.providerFactory.getProvider(user.userId);
    const email = await provider.getEmailById(user.userId, emailId);
    
    if (!email) {
      throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
    }

    // Sync email to database for future use
    await this.syncService.syncSingleEmail(user.userId, emailId, email);

    // Generate new summary
    const summary = await this.aiService.summarizeEmail({
      subject: email.subject,
      from: email.from,
      body: email.body,
    });

    // Update database with summary
    const updateOrConditions: any[] = [
      { gmailMessageId: emailId },
      { imapMessageId: emailId },
    ];
    
    if (isValidObjectId(emailId)) {
      updateOrConditions.unshift({ _id: emailId });
    }
    
    const updatedEmail = await this.emailModel.findOne({
      $or: updateOrConditions,
      accountId: user.userId,
    });

    if (updatedEmail) {
      await this.emailModel.updateOne(
        { _id: updatedEmail._id },
        {
          aiSummary: summary,
          summarizedAt: new Date(),
        },
      );
    }

    return {
      summary,
      summarizedAt: new Date(),
      cached: false,
    };
  }

  @Post('generate-reply/:emailId')
  @ApiOperation({ summary: 'Generate AI reply draft using Gemini' })
  @ApiResponse({ status: 200, description: 'Returns reply draft' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  @ApiResponse({ status: 503, description: 'AI service unavailable' })
  async generateReplyDraft(
    @CurrentUser() user: { userId: string },
    @Param('emailId') emailId: string,
  ) {
    // Use provider pattern to support both Gmail and Database providers
    const provider = await this.providerFactory.getProvider(user.userId);
    const email = await provider.getEmailById(user.userId, emailId);
    
    if (!email) {
      throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
    }

    // Sync email if not already cached
    await this.syncService.syncSingleEmail(user.userId, emailId, email);

    const draft = await this.aiService.generateReplyDraft({
      subject: email.subject,
      from: email.from,
      body: email.body,
    });

    return { draft };
  }
}
