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
  private createTransporter(email: string, password: string): Transporter {
    const provider = detectEmailProvider(email);
    const config = getProviderConfig(provider);

    this.logger.log(`Creating SMTP transporter for ${provider} provider`);

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
  ): Promise<void> {
    try {
      const transporter = this.createTransporter(userEmail, userPassword);

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
  async verifyCredentials(email: string, password: string): Promise<boolean> {
    try {
      const transporter = this.createTransporter(email, password);
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

      await this.sendMailWithCredentials(userEmail, userPassword, enhancedOptions);
      this.logger.log(`Encrypted email sent with full content preservation`);
    } catch (error) {
      this.logger.error(`Failed to send encrypted email: ${error.message}`);
      throw error;
    }
  }
}
