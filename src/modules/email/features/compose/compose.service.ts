import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { EmailProviderFactory } from '@email/providers/email-provider.factory';
import { SendEmailDto, ReplyEmailDto } from '@app/libs/dtos';
import { AttachmentService } from '@email/features/attachment/attachment.service';

/**
 * Compose Service
 * Handles sending and replying to emails
 * Single Responsibility: Email composition and sending operations
 */
@Injectable()
export class ComposeService {
  private readonly logger = new Logger(ComposeService.name);

  constructor(
    private readonly providerFactory: EmailProviderFactory,
    private readonly attachmentService: AttachmentService,
  ) {}

  async sendEmail(
    userId: string,
    userEmail: string,
    data: SendEmailDto,
  ): Promise<{ message: string; messageId?: string }> {
    try {
      const provider = await this.providerFactory.getProvider(userId);

      // Process attachments if any
      let attachmentBuffers: Array<{
        content: Buffer;
        filename: string;
        mimeType: string;
      }> = [];

      if (data.attachments && data.attachments.length > 0) {
        attachmentBuffers = await Promise.all(
          data.attachments.map(async (att) => {
            const content = await this.attachmentService.getAttachmentContent(
              att.attachmentId,
            );
            return content;
          }),
        );
      }

      const result = await provider.sendEmail(
        userId,
        userEmail,
        data.to,
        data.subject,
        data.body,
        attachmentBuffers,
      );

      if (result.success) {
        this.logger.log(`Email sent successfully by user ${userId}`);
        return {
          message: 'Email sent successfully',
          messageId: result.messageId,
        };
      } else {
        throw new HttpException(
          'Failed to send email',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      throw error;
    }
  }

  async replyToEmail(
    userId: string,
    userEmail: string,
    emailId: string,
    data: ReplyEmailDto,
  ): Promise<{ message: string; messageId?: string }> {
    try {
      const provider = await this.providerFactory.getProvider(userId);

      const result = await provider.replyToEmail(
        userId,
        userEmail,
        emailId,
        data.body,
        data.replyAll || false,
      );

      if (result.success) {
        this.logger.log(`Reply sent successfully by user ${userId}`);
        return {
          message: 'Reply sent successfully',
          messageId: result.messageId,
        };
      } else {
        throw new HttpException(
          'Failed to send reply',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send reply: ${error.message}`);
      throw error;
    }
  }
}
