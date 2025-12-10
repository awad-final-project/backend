import { Controller, Post, Param, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { AiService } from './ai.service';
import { EmailModel } from '@database/models';

@ApiTags('Email - AI')
@ApiBearerAuth()
@Controller('email/ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly emailModel: EmailModel,
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
    const email = await this.emailModel.findById(emailId);
    if (!email) {
      throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
    }
    if (email.accountId.toString() !== user.userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    // Check if summary already exists
    if (email.aiSummary) {
      return {
        summary: email.aiSummary,
        summarizedAt: email.summarizedAt,
        cached: true,
      };
    }

    // Generate new summary
    const summary = await this.aiService.summarizeEmail({
      subject: email.subject,
      from: email.from,
      body: email.body,
    });

    // Save summary to database
    await this.emailModel.updateOne(
      { _id: emailId },
      {
        aiSummary: summary,
        summarizedAt: new Date(),
      },
    );

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
    const email = await this.emailModel.findById(emailId);
    if (!email) {
      throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
    }
    if (email.accountId.toString() !== user.userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const draft = await this.aiService.generateReplyDraft({
      subject: email.subject,
      from: email.from,
      body: email.body,
    });

    return { draft };
  }
}
