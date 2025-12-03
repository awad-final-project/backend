import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as imaps from 'imap-simple';
import { simpleParser, ParsedMail, Attachment as MailAttachment } from 'mailparser';
import { S3Service } from '../storage/s3.service';

export interface ReceivedEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  date: Date;
  isRead: boolean;
  attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
    content: Buffer;
  }>;
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

@Injectable()
export class ImapService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImapService.name);
  private connection: imaps.ImapSimple | null = null;
  private isConnected = false;
  private readonly config: ImapConfig;
  private isEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
  ) {
    this.config = {
      host: this.configService.get<string>('IMAP_HOST') || 'imap.gmail.com',
      port: this.configService.get<number>('IMAP_PORT') || 993,
      user: this.configService.get<string>('IMAP_USER') || '',
      password: this.configService.get<string>('IMAP_PASSWORD') || '',
      tls: this.configService.get<boolean>('IMAP_TLS') !== false,
    };
    
    // Check if IMAP is configured
    this.isEnabled = !!(this.config.user && this.config.password);
  }

  async onModuleInit() {
    if (this.isEnabled) {
      await this.connect();
    } else {
      this.logger.warn('IMAP service is disabled - missing configuration');
    }
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Connect to IMAP server
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      const imapConfig: imaps.ImapSimpleOptions = {
        imap: {
          host: this.config.host,
          port: this.config.port,
          user: this.config.user,
          password: this.config.password,
          tls: this.config.tls,
          authTimeout: 10000,
          tlsOptions: {
            rejectUnauthorized: false,
          },
        },
      };

      this.connection = await imaps.connect(imapConfig);
      this.isConnected = true;
      this.logger.log('Connected to IMAP server successfully');
    } catch (error) {
      this.logger.error(`Failed to connect to IMAP server: ${error.message}`, error.stack);
      this.isConnected = false;
    }
  }

  /**
   * Disconnect from IMAP server
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        this.connection.end();
        this.isConnected = false;
        this.connection = null;
        this.logger.log('Disconnected from IMAP server');
      } catch (error) {
        this.logger.error(`Error disconnecting from IMAP: ${error.message}`);
      }
    }
  }

  /**
   * Fetch new emails from inbox (scheduled task)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async fetchNewEmails(): Promise<ReceivedEmail[]> {
    if (!this.isEnabled) {
      return [];
    }

    if (!this.isConnected) {
      await this.connect();
    }

    if (!this.connection) {
      this.logger.warn('No IMAP connection available');
      return [];
    }

    try {
      await this.connection.openBox('INBOX');

      // Search for unseen emails
      const searchCriteria = ['UNSEEN'];
      const fetchOptions = {
        bodies: ['HEADER', 'TEXT', ''],
        markSeen: false,
        struct: true,
      };

      const messages = await this.connection.search(searchCriteria, fetchOptions);
      const emails: ReceivedEmail[] = [];

      for (const message of messages) {
        try {
          const all = message.parts.find((part) => part.which === '');
          if (!all) continue;

          const parsed = await simpleParser(all.body);
          const email = await this.parseEmail(parsed);
          emails.push(email);
        } catch (error) {
          this.logger.error(`Error parsing email: ${error.message}`);
        }
      }

      this.logger.log(`Fetched ${emails.length} new emails`);
      return emails;
    } catch (error) {
      this.logger.error(`Error fetching emails: ${error.message}`, error.stack);
      
      // Try to reconnect on error
      this.isConnected = false;
      await this.connect();
      
      return [];
    }
  }

  /**
   * Fetch emails from a specific folder
   */
  async fetchEmailsFromFolder(
    folder: string = 'INBOX',
    limit: number = 50,
    unseenOnly: boolean = false,
  ): Promise<ReceivedEmail[]> {
    if (!this.isEnabled || !this.connection) {
      return [];
    }

    try {
      await this.connection.openBox(folder);

      const searchCriteria = unseenOnly ? ['UNSEEN'] : ['ALL'];
      const fetchOptions = {
        bodies: ['HEADER', 'TEXT', ''],
        markSeen: false,
        struct: true,
      };

      const messages = await this.connection.search(searchCriteria, fetchOptions);
      const limitedMessages = messages.slice(-limit);
      const emails: ReceivedEmail[] = [];

      for (const message of limitedMessages) {
        try {
          const all = message.parts.find((part) => part.which === '');
          if (!all) continue;

          const parsed = await simpleParser(all.body);
          const email = await this.parseEmail(parsed);
          emails.push(email);
        } catch (error) {
          this.logger.error(`Error parsing email: ${error.message}`);
        }
      }

      return emails;
    } catch (error) {
      this.logger.error(`Error fetching emails from ${folder}: ${error.message}`);
      return [];
    }
  }

  /**
   * Mark an email as read
   */
  async markAsRead(uid: number): Promise<void> {
    if (!this.connection) return;

    try {
      await this.connection.addFlags(uid, ['\\Seen']);
      this.logger.log(`Marked email ${uid} as read`);
    } catch (error) {
      this.logger.error(`Error marking email as read: ${error.message}`);
    }
  }

  /**
   * Mark an email as unread
   */
  async markAsUnread(uid: number): Promise<void> {
    if (!this.connection) return;

    try {
      await this.connection.delFlags(uid, ['\\Seen']);
      this.logger.log(`Marked email ${uid} as unread`);
    } catch (error) {
      this.logger.error(`Error marking email as unread: ${error.message}`);
    }
  }

  /**
   * Delete an email
   */
  async deleteEmail(uid: number): Promise<void> {
    if (!this.connection) return;

    try {
      await this.connection.addFlags(uid, ['\\Deleted']);
      this.logger.log(`Deleted email ${uid}`);
    } catch (error) {
      this.logger.error(`Error deleting email: ${error.message}`);
    }
  }

  /**
   * Get available mailboxes/folders
   */
  async getMailboxes(): Promise<string[]> {
    if (!this.connection) return [];

    try {
      const boxes = await this.connection.getBoxes();
      return this.flattenBoxes(boxes);
    } catch (error) {
      this.logger.error(`Error getting mailboxes: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse email from mailparser result
   */
  private async parseEmail(parsed: ParsedMail): Promise<ReceivedEmail> {
    const attachments: ReceivedEmail['attachments'] = [];

    if (parsed.attachments && parsed.attachments.length > 0) {
      for (const att of parsed.attachments) {
        attachments.push({
          filename: att.filename || 'unnamed',
          mimeType: att.contentType || 'application/octet-stream',
          size: att.size || 0,
          content: att.content,
        });
      }
    }

    // Handle from address (can be AddressObject or AddressObject[])
    let fromEmail = '';
    if (parsed.from) {
      const fromObj = Array.isArray(parsed.from) ? parsed.from[0] : parsed.from;
      const fromAddr = fromObj?.value?.[0];
      fromEmail = fromAddr?.address || fromAddr?.name || '';
    }

    // Handle to address (can be AddressObject or AddressObject[])
    let toEmail = '';
    if (parsed.to) {
      const toObj = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
      const toAddr = toObj?.value?.[0];
      toEmail = toAddr?.address || toAddr?.name || '';
    }

    return {
      messageId: parsed.messageId || '',
      from: fromEmail,
      to: toEmail,
      subject: parsed.subject || '(No Subject)',
      body: parsed.text || '',
      htmlBody: parsed.html || undefined,
      date: parsed.date || new Date(),
      isRead: false,
      attachments,
    };
  }

  /**
   * Flatten nested mailbox structure
   */
  private flattenBoxes(boxes: any, prefix: string = ''): string[] {
    const result: string[] = [];

    for (const name of Object.keys(boxes)) {
      const fullName = prefix ? `${prefix}/${name}` : name;
      result.push(fullName);

      if (boxes[name].children) {
        result.push(...this.flattenBoxes(boxes[name].children, fullName));
      }
    }

    return result;
  }

  /**
   * Check if IMAP is enabled and connected
   */
  isServiceAvailable(): boolean {
    return this.isEnabled && this.isConnected;
  }
}
