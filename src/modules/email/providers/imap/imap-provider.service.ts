import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountModel } from '@database/models';
import {
  IEmailProvider,
  IEmailDetail,
  IEmailListResponse,
  IEmailPreview,
  IMailbox,
} from '@email/common/interfaces';
import { ImapService } from '@app/modules/imap/imap.service';
import { DynamicMailService } from '@app/modules/mailer/dynamic-mail.service';
import { generatePreview } from '@email/common/utils/email.utils';

/**
 * IMAP/SMTP Provider Service
 * Implements IEmailProvider for IMAP (receive) and SMTP (send)
 * Supports local mail servers and standard email providers
 */
@Injectable()
export class ImapProviderService implements IEmailProvider {
  private readonly logger = new Logger(ImapProviderService.name);

  constructor(
    private readonly accountModel: AccountModel,
    private readonly configService: ConfigService,
    private readonly imapService: ImapService,
    private readonly dynamicMailService: DynamicMailService,
  ) {}

  /**
   * Check if user has IMAP credentials configured
   */
  async isAvailable(userId: string): Promise<boolean> {
    const user = await this.accountModel.findOne({ _id: userId });
    
    // Check if user has email and password for IMAP/SMTP
    if (user?.imapEmail && user?.imapPassword) {
      try {
        // Verify credentials
        const isValid = await this.dynamicMailService.verifyCredentials(
          user.imapEmail,
          user.imapPassword,
        );
        return isValid;
      } catch (error) {
        this.logger.warn(`IMAP credentials invalid for user ${userId}: ${error.message}`);
        return false;
      }
    }
    
    return false;
  }

  async getMailboxes(userId: string): Promise<IMailbox[]> {
    // For IMAP, we return standard mailbox structure
    // Actual counts would require connecting to IMAP and fetching
    // For now, return structure with zero counts
    return [
      { id: 'inbox', name: 'Inbox', count: 0, icon: 'inbox' },
      { id: 'starred', name: 'Starred', count: 0, icon: 'star' },
      { id: 'sent', name: 'Sent', count: 0, icon: 'send' },
      { id: 'drafts', name: 'Drafts', count: 0, icon: 'file' },
      { id: 'archive', name: 'Archive', count: 0, icon: 'archive' },
      { id: 'trash', name: 'Trash', count: 0, icon: 'trash' },
    ];
  }

  async getEmailsByFolder(
    userId: string,
    folder: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<IEmailListResponse> {
    const user = await this.accountModel.findOne({ _id: userId });
    if (!user?.imapEmail || !user?.imapPassword) {
      throw new Error('IMAP credentials not found');
    }

    try {
      // Map folder to IMAP mailbox name
      const mailboxName = this.mapFolderToMailbox(folder);
      
      // Fetch emails from IMAP
      const emails = await this.imapService.fetchEmailsWithCredentials(
        user.imapEmail,
        user.imapPassword,
        mailboxName,
        limit,
      );

      // Convert to IEmailPreview format
      const emailList: IEmailPreview[] = emails.map((email) => ({
        id: email.messageId,
        from: email.from,
        to: email.to,
        subject: email.subject,
        preview: generatePreview(email.body),
        isRead: email.isRead,
        isStarred: false,
        sentAt: email.date,
        folder: folder,
        hasAttachments: email.attachments && email.attachments.length > 0,
      }));

      return {
        emails: emailList,
        total: emails.length,
        page,
        limit,
        totalPages: 1,
        hasMore: false,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch IMAP emails: ${error.message}`);
      throw error;
    }
  }

  async getEmailById(
    userId: string,
    emailId: string,
  ): Promise<IEmailDetail | null> {
    const user = await this.accountModel.findOne({ _id: userId });
    if (!user?.imapEmail || !user?.imapPassword) {
      throw new Error('IMAP credentials not found');
    }

    try {
      // Fetch specific email from IMAP
      const email = await this.imapService.fetchEmailByIdWithCredentials(
        user.imapEmail,
        user.imapPassword,
        emailId,
      );

      if (!email) {
        return null;
      }

      return {
        id: email.messageId,
        from: email.from,
        to: email.to,
        cc: '',
        bcc: '',
        subject: email.subject,
        body: email.htmlBody || email.body,
        preview: generatePreview(email.body),
        isRead: email.isRead,
        isStarred: false,
        sentAt: email.date,
        readAt: email.isRead ? email.date : null,
        folder: 'inbox',
        attachments: email.attachments?.map((att) => ({
          id: att.filename,
          attachmentId: att.filename,
          filename: att.filename,
          originalName: att.filename,
          mimeType: att.mimeType,
          size: att.size,
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to fetch IMAP email: ${error.message}`);
      return null;
    }
  }

  async sendEmail(
    userId: string,
    userEmail: string,
    to: string,
    subject: string,
    body: string,
    attachments?: Array<{ content: Buffer; filename: string; mimeType: string }>,
  ): Promise<{ success: boolean; messageId?: string }> {
    const user = await this.accountModel.findOne({ _id: userId });
    if (!user?.imapEmail || !user?.imapPassword) {
      throw new Error('SMTP credentials not found');
    }

    try {
      await this.dynamicMailService.sendMailWithCredentials(
        user.imapEmail,
        user.imapPassword,
        {
          from: user.imapEmail,
          to,
          subject,
          html: body,
          attachments: attachments?.map(att => ({
            filename: att.filename,
            content: att.content,
            contentType: att.mimeType,
          })),
        },
      );

      this.logger.log(`Email sent via SMTP for user ${userId}`);
      
      return {
        success: true,
        messageId: Date.now().toString(),
      };
    } catch (error) {
      this.logger.error(`Failed to send SMTP email: ${error.message}`);
      return {
        success: false,
      };
    }
  }

  async replyToEmail(
    userId: string,
    userEmail: string,
    emailId: string,
    body: string,
    replyAll: boolean,
    attachments?: Array<{ content: Buffer; filename: string; mimeType: string }>,
  ): Promise<{ success: boolean; messageId?: string }> {
    // Get original email first
    const originalEmail = await this.getEmailById(userId, emailId);
    if (!originalEmail) {
      throw new Error('Original email not found');
    }

    // Send reply
    return this.sendEmail(
      userId,
      userEmail,
      originalEmail.from,
      `Re: ${originalEmail.subject}`,
      body,
      attachments,
    );
  }

  async markAsRead(userId: string, emailId: string, isRead: boolean): Promise<boolean> {
    // IMAP mark as read is complex and requires IMAP connection
    // For now, just return true
    this.logger.warn('IMAP markAsRead not fully implemented');
    return true;
  }

  async toggleStar(userId: string, emailId: string): Promise<{ isStarred: boolean }> {
    // IMAP star is a flag operation
    this.logger.warn('IMAP toggleStar not fully implemented');
    return { isStarred: false };
  }

  async deleteEmail(userId: string, emailId: string): Promise<boolean> {
    const user = await this.accountModel.findOne({ _id: userId });
    if (!user?.imapEmail || !user?.imapPassword) {
      throw new Error('IMAP credentials not found');
    }

    try {
      await this.imapService.deleteEmailWithCredentials(
        user.imapEmail,
        user.imapPassword,
        emailId,
      );
      this.logger.log(`Email deleted via IMAP for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete IMAP email: ${error.message}`);
      return false;
    }
  }

  async moveToFolder(userId: string, emailId: string, folder: string): Promise<boolean> {
    // IMAP move requires copying to new folder and deleting from old
    this.logger.warn('IMAP moveToFolder not fully implemented');
    return true;
  }

  async modifyEmail(
    userId: string,
    emailId: string,
    modifications: any,
  ): Promise<void> {
    // IMAP modifications are limited
    // Most operations would need to be done via IMAP flags
    this.logger.warn('IMAP email modifications not fully supported');
  }

  /**
   * Map folder name to IMAP mailbox name
   */
  private mapFolderToMailbox(folder: string): string {
    const mapping: Record<string, string> = {
      inbox: 'INBOX',
      sent: 'Sent',
      drafts: 'Drafts',
      trash: 'Trash',
      archive: 'Archive',
      starred: 'INBOX', // Starred is a flag, not a mailbox
    };
    return mapping[folder.toLowerCase()] || 'INBOX';
  }
}
