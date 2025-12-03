import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { EmailProviderFactory } from '../../providers/email-provider.factory';
import { IEmailDetail, IEmailListResponse } from '../../common/interfaces';

/**
 * Inbox Service
 * Handles reading and viewing emails
 * Single Responsibility: Email retrieval operations only
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly providerFactory: EmailProviderFactory) {}

  async getEmailsByFolder(
    userId: string,
    folder: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<IEmailListResponse> {
    const provider = await this.providerFactory.getProvider(userId);
    return provider.getEmailsByFolder(userId, folder, page, limit);
  }

  async getEmailById(userId: string, emailId: string): Promise<IEmailDetail> {
    const provider = await this.providerFactory.getProvider(userId);
    const email = await provider.getEmailById(userId, emailId);
    
    if (!email) {
      throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
    }
    
    return email;
  }
}
