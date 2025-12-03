import { IEmailDetail, IEmailPreview } from './email-message.interface';

/**
 * Email Repository Interface
 * For local database operations (fallback when provider is unavailable)
 * Following Repository Pattern
 */
export interface IEmailRepository {
  /**
   * Find emails by criteria
   */
  findByFolder(
    userId: string,
    folder: string,
    page: number,
    limit: number,
  ): Promise<{
    emails: IEmailPreview[];
    total: number;
  }>;

  /**
   * Find email by ID
   */
  findById(userId: string, emailId: string): Promise<IEmailDetail | null>;

  /**
   * Save or update email
   */
  save(email: Partial<IEmailDetail> & { accountId: string }): Promise<IEmailDetail>;

  /**
   * Update email properties
   */
  update(
    userId: string,
    emailId: string,
    updates: Partial<IEmailDetail>,
  ): Promise<boolean>;

  /**
   * Delete email
   */
  delete(userId: string, emailId: string): Promise<boolean>;

  /**
   * Count emails by criteria
   */
  countByFolder(userId: string, folder: string): Promise<number>;
  countUnread(userId: string, folder?: string): Promise<number>;
  countStarred(userId: string): Promise<number>;
}
