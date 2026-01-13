import { Injectable, Logger } from '@nestjs/common';
import { IEmailProvider, IEmailProviderFactory } from '@email/common/interfaces';
import { GmailProviderService } from './gmail/gmail-provider.service';
import { ImapProviderService } from './imap/imap-provider.service';
import { DatabaseProviderService } from './database/database-provider.service';

/**
 * Email Provider Factory
 * Implements Strategy Pattern to select appropriate email provider
 * Follows Open/Closed Principle - open for extension (new providers) closed for modification
 */
@Injectable()
export class EmailProviderFactory implements IEmailProviderFactory {
  private readonly logger = new Logger(EmailProviderFactory.name);

  constructor(
    private readonly gmailProvider: GmailProviderService,
    private readonly imapProvider: ImapProviderService,
    private readonly databaseProvider: DatabaseProviderService,
  ) {}

  /**
   * Get appropriate provider for user
   * Priority: Gmail > IMAP/SMTP > Database (fallback)
   */
  async getProvider(userId: string): Promise<IEmailProvider> {
    // Try Gmail first
    const gmailAvailable = await this.gmailProvider.isAvailable(userId);
    if (gmailAvailable) {
      this.logger.log(`Using Gmail provider for user ${userId}`);
      return this.gmailProvider;
    }

    // Try IMAP/SMTP
    const imapAvailable = await this.imapProvider.isAvailable(userId);
    if (imapAvailable) {
      this.logger.log(`Using IMAP/SMTP provider for user ${userId}`);
      return this.imapProvider;
    }

    // Fallback to database
    this.logger.log(`Using Database provider for user ${userId}`);
    return this.databaseProvider;
  }
}
