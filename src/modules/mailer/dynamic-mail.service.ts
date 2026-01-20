import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { detectEmailProvider, getProviderConfig } from '../imap/email-provider.config';

export interface DynamicMailOptions {
  from: string;
  to: string | string[];
  subject: string;
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
export class DynamicMailService {
  private readonly logger = new Logger(DynamicMailService.name);
  private transporters: Map<string, Transporter> = new Map();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Create SMTP transporter for a user's email
   */
  private createTransporter(email: string, password: string, provider?: string): Transporter {
    const detectedProvider = provider || detectEmailProvider(email);
    const config = getProviderConfig(detectedProvider);

    this.logger.log(`Creating SMTP transporter for ${detectedProvider} provider`);

    return nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure, // false for STARTTLS
      auth: {
        user: email,
        pass: password,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  /**
   * Send email using user's credentials
   */
  async sendMailWithCredentials(
    userEmail: string,
    userPassword: string,
    options: DynamicMailOptions,
    provider?: string,
  ): Promise<void> {
    try {
      const transporter = this.createTransporter(userEmail, userPassword, provider);

      const mailOptions = {
        from: options.from || userEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo || userEmail,
      };

      const info = await transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully: ${info.messageId}`);
      
      // Close transporter
      transporter.close();
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify SMTP credentials
   */
  async verifyCredentials(email: string, password: string, provider: string = 'other'): Promise<boolean> {
    try {
      const transporter = this.createTransporter(email, password, provider);
      await transporter.verify();
      transporter.close();
      this.logger.log(`SMTP credentials verified for ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to verify SMTP credentials for ${email}: ${error.message}`);
      return false;
    }
  }

  /**
   * Send encrypted email with full content preservation
   */
  async sendEncryptedMail(
    userEmail: string,
    userPassword: string,
    options: DynamicMailOptions,
    provider?: string,
  ): Promise<void> {
    try {
      // Ensure content encoding is preserved
      const enhancedOptions = {
        ...options,
        encoding: 'utf-8',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Transfer-Encoding': '8bit',
        },
      };

      await this.sendMailWithCredentials(userEmail, userPassword, enhancedOptions, provider);
      this.logger.log(`Encrypted email sent with full content preservation`);
    } catch (error) {
      this.logger.error(`Failed to send encrypted email: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send email using system SMTP configuration (for internal @hkt.com users sending to external)
   */
  async sendWithSystemTransport(options: DynamicMailOptions): Promise<void> {
    try {
      const mailHost = this.configService.get<string>('MAIL_HOST');
      const mailPort = parseInt(this.configService.get<string>('MAIL_PORT') || '587', 10);
      const mailSecure = this.configService.get<string>('MAIL_SECURE') === 'true';
      const mailUser = this.configService.get<string>('MAIL_USER');
      const mailPassword = this.configService.get<string>('MAIL_PASSWORD');
      const mailFrom = this.configService.get<string>('MAIL_FROM') || 'noreply@hkt.com';

      if (!mailHost || !mailUser || !mailPassword) {
        throw new Error('System SMTP not configured. Please set MAIL_HOST, MAIL_USER, MAIL_PASSWORD in .env');
      }

      const transporter = nodemailer.createTransport({
        host: mailHost,
        port: mailPort,
        secure: mailSecure,
        auth: {
          user: mailUser,
          pass: mailPassword,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const mailOptions = {
        from: options.from || mailFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo,
      };

      const info = await transporter.sendMail(mailOptions);
      this.logger.log(`System email sent successfully: ${info.messageId}`);
      
      transporter.close();
    } catch (error) {
      this.logger.error(`Failed to send system email: ${error.message}`, error.stack);
      throw error;
    }
  }
}
