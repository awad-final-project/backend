import { Controller, Post, Param, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { AiService } from './ai.service';
import { EmailModel } from '@database/models';
import { EmailProviderFactory } from '@email/providers/email-provider.factory';

@ApiTags('Email - AI')
@ApiBearerAuth()
@Controller('email/ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly emailModel: EmailModel,
    private readonly providerFactory: EmailProviderFactory,
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
    // Use provider pattern to support both Gmail and Database providers
    const provider = await this.providerFactory.getProvider(user.userId);
    const email = await provider.getEmailById(user.userId, emailId);
    
    if (!email) {
      throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
    }

    // Try to get cached summary from database (for both Gmail and local emails)
    const dbEmail = await this.emailModel.findOne({
      $or: [
        { _id: emailId }, // Local mail: MongoDB ObjectID
        { gmailMessageId: emailId }, // Gmail: Gmail message ID
      ],
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

    // Generate new summary
    const summary = await this.aiService.summarizeEmail({
      subject: email.subject,
      from: email.from,
      body: email.body,
    });

    // Save summary to database for caching
    if (dbEmail) {
      // Update existing record
      await this.emailModel.updateOne(
        { _id: dbEmail._id },
        {
          aiSummary: summary,
          summarizedAt: new Date(),
        },
      );
    } else {
      // Create new record for Gmail emails
      await this.emailModel.save({
        gmailMessageId: emailId,
        accountId: user.userId,
        subject: email.subject,
        from: email.from,
        to: email.to,
        body: email.body,
        sentAt: email.sentAt,
        folder: email.folder || 'inbox',
        isRead: email.isRead,
        isStarred: email.isStarred,
        aiSummary: summary,
        summarizedAt: new Date(),
      });
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

    const draft = await this.aiService.generateReplyDraft({
      subject: email.subject,
      from: email.from,
      body: email.body,
    });

    return { draft };
  }
}
