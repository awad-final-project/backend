import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { EmailProviderFactory } from '@email/providers/email-provider.factory';
import {
  IEmailDetail,
  IEmailListResponse,
  IEmailPreview,
  EmailFilterOptions,
} from '@email/common/interfaces';
import { EmailModel } from '@database/models';
import { FilterQuery } from 'mongoose';
import { EmailDocument } from '@database/schemas/email.schema';

export type EmailFilters = EmailFilterOptions;

/**
 * Inbox Service
 * Handles reading and viewing emails
 * Single Responsibility: Email retrieval operations only
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly providerFactory: EmailProviderFactory,
    private readonly emailModel: EmailModel,
  ) {}

  async getEmailsByFolder(
    userId: string,
    folder: string,
    page: number = 1,
    limit: number = 50,
    filters?: EmailFilters,
  ): Promise<IEmailListResponse> {
    try {
      const provider = await this.providerFactory.getProvider(userId);
      const result = await provider.getEmailsByFolder(userId, folder, page, limit);

      const processedEmails = this.applyFiltersAndSorting(result.emails, filters);

      return {
        ...result,
        emails: processedEmails,
        total: processedEmails.length,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch emails from folder ${folder}:`, error);
      throw new HttpException(
        {
          message: 'Failed to fetch emails',
          error: error.message || 'Unknown error occurred',
          folder,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getEmailById(userId: string, emailId: string): Promise<IEmailDetail> {
    try {
      const provider = await this.providerFactory.getProvider(userId);
      const email = await provider.getEmailById(userId, emailId);
      
      if (!email) {
        throw new HttpException(
          {
            message: 'Email not found',
            error: 'The requested email does not exist or you do not have permission to access it',
            emailId,
          },
          HttpStatus.NOT_FOUND,
        );
      }
      
      return email;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Failed to fetch email ${emailId}:`, error);
      throw new HttpException(
        {
          message: 'Failed to fetch email',
          error: error.message || 'Unknown error occurred',
          emailId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private applyFiltersAndSorting(
    emails: IEmailPreview[],
    filters?: EmailFilters,
  ): IEmailPreview[] {
    if (!filters || Object.values(filters).every((value) => value === undefined)) {
      return emails;
    }

    let filteredEmails = [...emails];

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredEmails = filteredEmails.filter((email) =>
        email.subject.toLowerCase().includes(searchLower) ||
        email.from.toLowerCase().includes(searchLower) ||
        email.preview.toLowerCase().includes(searchLower),
      );
    }

    if (filters.from) {
      const fromLower = filters.from.toLowerCase();
      filteredEmails = filteredEmails.filter((email) =>
        email.from.toLowerCase().includes(fromLower),
      );
    }

    if (filters.unread) {
      filteredEmails = filteredEmails.filter((email) => !email.isRead);
    }

    if (filters.starred) {
      filteredEmails = filteredEmails.filter((email) => email.isStarred);
    }

    if (filters.hasAttachments) {
      filteredEmails = filteredEmails.filter((email) => email.hasAttachments);
    }

    if (filters.startDate || filters.endDate) {
      filteredEmails = filteredEmails.filter((email) => {
        const emailDate = new Date(email.sentAt);
        if (filters.startDate && emailDate < filters.startDate) return false;
        if (filters.endDate && emailDate > filters.endDate) return false;
        return true;
      });
    }

    const sortOrder = filters.sort || 'newest';
    filteredEmails.sort((a, b) => {
      const diff = new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime();
      return sortOrder === 'newest' ? -diff : diff;
    });

    return filteredEmails;
  }

  async getEmailIdsForSelection(
    userId: string,
    folder: string,
    filters?: EmailFilters,
  ): Promise<{ emailIds: string[]; total: number }> {
    const provider = await this.providerFactory.getProvider(userId);

    if (provider.getEmailIdsForFolder) {
      const ids = await provider.getEmailIdsForFolder(userId, folder, filters);
      return {
        emailIds: ids,
        total: ids.length,
      };
    }

    const mongoFilter = this.buildDatabaseFilter(userId, folder, filters);
    const fallbackIds = await this.emailModel.findMessageIds(mongoFilter);

    return {
      emailIds: fallbackIds,
      total: fallbackIds.length,
    };
  }

  private buildDatabaseFilter(
    userId: string,
    folder: string,
    filters?: EmailFilters,
  ): FilterQuery<EmailDocument> {
    const query: FilterQuery<EmailDocument> = {
      accountId: userId,
    };

    if (folder === 'starred') {
      query.isStarred = true;
      query.folder = { $ne: 'trash' } as any;
    } else if (folder && folder !== 'all') {
      query.folder = folder;
    }

    if (filters?.from) {
      query.from = { $regex: filters.from, $options: 'i' } as any;
    }

    if (filters?.unread) {
      query.isRead = false;
    }

    if (filters?.starred) {
      query.isStarred = true;
    }

    if (filters?.hasAttachments) {
      query.hasAttachments = true;
    }

    if (filters?.startDate || filters?.endDate) {
      query.sentAt = {} as any;
      if (filters.startDate) {
        query.sentAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.sentAt.$lte = filters.endDate;
      }
    }

    if (filters?.search) {
      const regex = new RegExp(filters.search, 'i');
      query.$or = [
        { subject: regex },
        { from: regex },
        { preview: regex },
      ] as any;
    }

    return query;
  }

  private async persistEmails(userId: string, emails: IEmailPreview[]): Promise<void> {
    if (!emails.length) {
      return;
    }

    await Promise.allSettled(
      emails.map((email) =>
        this.emailModel.updateOne(
          { accountId: userId, messageId: email.id },
          {
            $set: {
              from: email.from,
              to: email.to,
              subject: email.subject,
              body: email.preview || '',
              preview: email.preview || '',
              isRead: email.isRead,
              isStarred: email.isStarred,
              folder: email.folder || 'inbox',
              sentAt: new Date(email.sentAt),
              hasAttachments: Boolean(email.hasAttachments),
              messageId: email.id,
            },
            $setOnInsert: {
              accountId: userId,
            },
          },
          { upsert: true },
        ),
      ),
    );
  }
}
