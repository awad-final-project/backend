import { Injectable, Logger } from '@nestjs/common';
import { IEmailProvider, IEmailProviderFactory } from '@email/common/interfaces';
import { GmailProviderService } from './gmail/gmail-provider.service';
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
    private readonly databaseProvider: DatabaseProviderService,
  ) {}

  /**
   * Get appropriate provider for user
   * Priority: Gmail > IMAP > Database (fallback)
   */
  async getProvider(userId: string): Promise<IEmailProvider> {
    // Try Gmail first
    const gmailAvailable = await this.gmailProvider.isAvailable(userId);
    if (gmailAvailable) {
      this.logger.log(`Using Gmail provider for user ${userId}`);
      return this.gmailProvider;
    }

    // Add IMAP check here in future
    // const imapAvailable = await this.imapProvider.isAvailable(userId);
    // if (imapAvailable) return this.imapProvider;

    // Fallback to database
    this.logger.log(`Using Database provider for user ${userId}`);
    return this.databaseProvider;
  }
}
