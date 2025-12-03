import { Injectable, Logger } from '@nestjs/common';
import { EmailProviderFactory } from '../../providers/email-provider.factory';
import { ModifyEmailDto } from '../../../../libs/dtos';

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
}
