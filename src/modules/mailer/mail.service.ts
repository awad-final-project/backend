import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  context?: Record<string, any>;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
  }>;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send an email using template
   */
  async sendMail(options: SendMailOptions): Promise<void> {
    try {
      const from = this.configService.get<string>('MAIL_FROM') || 'noreply@example.com';

      await this.mailerService.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        template: options.template,
        context: options.context,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo,
      });

      this.logger.log(`Email sent successfully to: ${options.to}`);
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Send a welcome email
   */
  async sendWelcomeEmail(to: string, username: string): Promise<void> {
    await this.sendMail({
      to,
      subject: 'Welcome to Our Email App!',
      template: 'welcome',
      context: {
        username,
        year: new Date().getFullYear(),
      },
    });
  }

  /**
   * Send a password reset email
   */
  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${resetToken}`;

    await this.sendMail({
      to,
      subject: 'Password Reset Request',
      template: 'password-reset',
      context: {
        resetUrl,
        year: new Date().getFullYear(),
      },
    });
  }

  /**
   * Send email with attachments
   */
  async sendEmailWithAttachments(
    to: string,
    subject: string,
    body: string,
    attachments: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }>,
  ): Promise<void> {
    await this.sendMail({
      to,
      subject,
      html: body,
      attachments: attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    });
  }

  /**
   * Send a notification email
   */
  async sendNotificationEmail(
    to: string,
    title: string,
    message: string,
  ): Promise<void> {
    await this.sendMail({
      to,
      subject: title,
      template: 'notification',
      context: {
        title,
        message,
        year: new Date().getFullYear(),
      },
    });
  }
}
