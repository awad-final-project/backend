import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { EmailProviderFactory } from '@email/providers/email-provider.factory';
import { IEmailDetail, IEmailListResponse } from '@email/common/interfaces';

export interface EmailFilters {
  search?: string;
  from?: string;
  unread?: boolean;
  starred?: boolean;
  startDate?: Date;
  endDate?: Date;
}

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
    filters?: EmailFilters,
  ): Promise<IEmailListResponse> {
    try {
      const provider = await this.providerFactory.getProvider(userId);
      const result = await provider.getEmailsByFolder(userId, folder, page, limit);
      
      // Apply client-side filters if provided
      if (filters && Object.values(filters).some(v => v !== undefined)) {
        let filteredEmails = result.emails;
        
        // Search filter (search in subject, from, preview)
        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          filteredEmails = filteredEmails.filter(email => 
            email.subject.toLowerCase().includes(searchLower) ||
            email.from.toLowerCase().includes(searchLower) ||
            email.preview.toLowerCase().includes(searchLower)
          );
        }
        
        // From filter
        if (filters.from) {
          const fromLower = filters.from.toLowerCase();
          filteredEmails = filteredEmails.filter(email => 
            email.from.toLowerCase().includes(fromLower)
          );
        }
        
        // Unread filter
        if (filters.unread !== undefined) {
          filteredEmails = filteredEmails.filter(email => 
            email.isRead !== filters.unread
          );
        }
        
        // Starred filter
        if (filters.starred !== undefined) {
          filteredEmails = filteredEmails.filter(email => 
            email.isStarred === filters.starred
          );
        }
        
        // Date range filter
        if (filters.startDate || filters.endDate) {
          filteredEmails = filteredEmails.filter(email => {
            const emailDate = new Date(email.sentAt);
            if (filters.startDate && emailDate < filters.startDate) return false;
            if (filters.endDate && emailDate > filters.endDate) return false;
            return true;
          });
        }
        
        return {
          ...result,
          emails: filteredEmails,
          total: filteredEmails.length,
          totalPages: Math.ceil(filteredEmails.length / limit),
        };
      }
      
      return result;
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
}
