import { Injectable, Logger } from '@nestjs/common';
import { EmailProviderFactory } from '../../providers/email-provider.factory';
import { IMailbox } from '../../common/interfaces';

/**
 * Mailbox Service
 * Manages email folders/mailboxes
 * Single Responsibility: Handle mailbox/folder operations only
 */
@Injectable()
export class MailboxService {
  private readonly logger = new Logger(MailboxService.name);

  constructor(private readonly providerFactory: EmailProviderFactory) {}

  async getMailboxes(userId: string): Promise<IMailbox[]> {
    const provider = await this.providerFactory.getProvider(userId);
    return provider.getMailboxes(userId);
  }
}
