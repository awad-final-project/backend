import { IEmailDetail, IEmailListResponse, IEmailPreview, IMailbox } from './email-message.interface';

/**
 * Email Provider Interface
 * Following Dependency Inversion Principle - high-level modules depend on abstraction
 * Implementations: GmailProvider, ImapProvider
 */
export interface IEmailProvider {
  /**
   * Check if provider is available for the user
   */
  isAvailable(userId: string): Promise<boolean>;

  /**
   * Get all mailboxes/folders for a user
   */
  getMailboxes(userId: string): Promise<IMailbox[]>;

  /**
   * Get emails from a specific folder with pagination
   */
  getEmailsByFolder(
    userId: string,
    folder: string,
    page: number,
    limit: number,
  ): Promise<IEmailListResponse>;

  /**
   * Get full email details by ID
   */
  getEmailById(userId: string, emailId: string): Promise<IEmailDetail | null>;

  /**
   * Send a new email
   */
  sendEmail(
    userId: string,
    userEmail: string,
    to: string,
    subject: string,
    body: string,
    attachments?: Array<{ content: Buffer; filename: string; mimeType: string }>,
  ): Promise<{ success: boolean; messageId?: string }>;

  /**
   * Reply to an email
   */
  replyToEmail(
    userId: string,
    userEmail: string,
    emailId: string,
    body: string,
    replyAll: boolean,
    attachments?: Array<{ content: Buffer; filename: string; mimeType: string }>,
  ): Promise<{ success: boolean; messageId?: string }>;

  /**
   * Mark email as read/unread
   */
  markAsRead(userId: string, emailId: string, isRead: boolean): Promise<boolean>;

  /**
   * Toggle star status
   */
  toggleStar(userId: string, emailId: string): Promise<{ isStarred: boolean }>;

  /**
   * Delete an email (move to trash or permanent delete)
   */
  deleteEmail(userId: string, emailId: string): Promise<boolean>;

  /**
   * Move email to folder
   */
  moveToFolder(userId: string, emailId: string, folder: string): Promise<boolean>;
}

/**
 * Email Provider Factory
 * Returns appropriate provider based on user configuration
 */
export interface IEmailProviderFactory {
  getProvider(userId: string): Promise<IEmailProvider>;
}
