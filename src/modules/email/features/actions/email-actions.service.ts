import { Injectable, Logger } from '@nestjs/common';
import { EmailProviderFactory } from '@email/providers/email-provider.factory';
import { ModifyEmailDto } from '@app/libs/dtos';

/**
 * Email Actions Service
 * Handles email state modifications (star, read, delete, move)
 * Single Responsibility: Email action operations only
 */
@Injectable()
export class EmailActionsService {
  private readonly logger = new Logger(EmailActionsService.name);

  constructor(private readonly providerFactory: EmailProviderFactory) {}

  async toggleStar(
    userId: string,
    emailId: string,
  ): Promise<{ message: string; isStarred: boolean }> {
    const provider = await this.providerFactory.getProvider(userId);
    const result = await provider.toggleStar(userId, emailId);
    
    return {
      message: result.isStarred
        ? 'Email starred successfully'
        : 'Email unstarred successfully',
      isStarred: result.isStarred,
    };
  }

  async markAsRead(
    userId: string,
    emailId: string,
    isRead: boolean,
  ): Promise<{ message: string; isRead: boolean }> {
    const provider = await this.providerFactory.getProvider(userId);
    await provider.markAsRead(userId, emailId, isRead);
    
    return {
      message: isRead
        ? 'Email marked as read'
        : 'Email marked as unread',
      isRead,
    };
  }

  async deleteEmail(
    userId: string,
    emailId: string,
  ): Promise<{ message: string }> {
    const provider = await this.providerFactory.getProvider(userId);
    const success = await provider.deleteEmail(userId, emailId);
    
    if (!success) {
      throw new Error('Failed to delete email');
    }
    
    return { message: 'Email deleted successfully' };
  }

  async modifyEmail(
    userId: string,
    emailId: string,
    data: ModifyEmailDto,
  ): Promise<{ message: string }> {
    const provider = await this.providerFactory.getProvider(userId);
    
    // Apply modifications
    if (data.isRead !== undefined) {
      await provider.markAsRead(userId, emailId, data.isRead);
    }
    
    if (data.isStarred !== undefined) {
      const current = await provider.getEmailById(userId, emailId);
      if (current && current.isStarred !== data.isStarred) {
        await provider.toggleStar(userId, emailId);
      }
    }
    
    return { message: 'Email modified successfully' };
  }

  async bulkDelete(
    userId: string,
    emailIds: string[],
  ): Promise<{ message: string; deleted: number }> {
    const provider = await this.providerFactory.getProvider(userId);
    let deletedCount = 0;

    for (const emailId of emailIds) {
      try {
        const success = await provider.deleteEmail(userId, emailId);
        if (success) deletedCount++;
      } catch (error) {
        this.logger.warn(`Failed to delete email ${emailId}:`, error);
      }
    }

    return {
      message: `Deleted ${deletedCount} of ${emailIds.length} emails`,
      deleted: deletedCount,
    };
  }

  async bulkToggleStar(
    userId: string,
    emailIds: string[],
    star: boolean,
  ): Promise<{ message: string; modified: number }> {
    const provider = await this.providerFactory.getProvider(userId);
    let modifiedCount = 0;

    for (const emailId of emailIds) {
      try {
        const current = await provider.getEmailById(userId, emailId);
        if (current && current.isStarred !== star) {
          await provider.toggleStar(userId, emailId);
          modifiedCount++;
        } else if (current && current.isStarred === star) {
          // Already in desired state
          modifiedCount++;
        }
      } catch (error) {
        this.logger.warn(`Failed to toggle star for email ${emailId}:`, error);
      }
    }

    return {
      message: `Modified ${modifiedCount} of ${emailIds.length} emails`,
      modified: modifiedCount,
    };
  }

  async bulkMarkAsRead(
    userId: string,
    emailIds: string[],
    isRead: boolean,
  ): Promise<{ message: string; modified: number }> {
    const provider = await this.providerFactory.getProvider(userId);
    let modifiedCount = 0;

    for (const emailId of emailIds) {
      try {
        await provider.markAsRead(userId, emailId, isRead);
        modifiedCount++;
      } catch (error) {
        this.logger.warn(`Failed to mark email ${emailId} as ${isRead ? 'read' : 'unread'}:`, error);
      }
    }

    return {
      message: `Marked ${modifiedCount} of ${emailIds.length} emails as ${isRead ? 'read' : 'unread'}`,
      modified: modifiedCount,
    };
  }
}
