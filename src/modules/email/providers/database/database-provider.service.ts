import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { EmailModel, AccountModel } from '@database/models';
import {
  IEmailProvider,
  IEmailDetail,
  IEmailListResponse,
  IEmailPreview,
  IMailbox,
} from '@email/common/interfaces';
import { EmailFilterOptions } from '@email/common/interfaces';
import { isValidObjectId } from 'mongoose';
import { generatePreview } from '@email/common/utils/email.utils';
import { DynamicMailService } from '@app/modules/mailer';

/**
 * Database Provider Service
 * Fallback provider when external providers (Gmail/IMAP) are not available
 * Implements IEmailProvider using local database storage
 * Now supports sending internal emails (@hkt.com) and external emails via SMTP
 */
@Injectable()
export class DatabaseProviderService implements IEmailProvider {
  private readonly logger = new Logger(DatabaseProviderService.name);
  private readonly INTERNAL_DOMAIN = 'hkt.com';

  constructor(
    private readonly emailModel: EmailModel,
    private readonly accountModel: AccountModel,
    private readonly dynamicMailService: DynamicMailService,
  ) {}

  async isAvailable(userId: string): Promise<boolean> {
    // Database provider is always available
    return true;
  }

  async getMailboxes(userId: string): Promise<IMailbox[]> {
    try {
      const inboxCount = await this.emailModel.countDocuments({
        accountId: userId,
        folder: 'inbox',
        isRead: false,
      });

      const sentCount = await this.emailModel.countDocuments({
        accountId: userId,
        folder: 'sent',
      });

      const draftsCount = await this.emailModel.countDocuments({
        accountId: userId,
        folder: 'drafts',
      });

      const starredCount = await this.emailModel.countDocuments({
        accountId: userId,
        isStarred: true,
      });

      const archiveCount = await this.emailModel.countDocuments({
        accountId: userId,
        folder: 'archive',
      });

      const trashCount = await this.emailModel.countDocuments({
        accountId: userId,
        folder: 'trash',
      });

      return [
        { id: 'inbox', name: 'Inbox', count: inboxCount, icon: 'inbox' },
        { id: 'starred', name: 'Starred', count: starredCount, icon: 'star' },
        { id: 'sent', name: 'Sent', count: sentCount, icon: 'send' },
        { id: 'drafts', name: 'Drafts', count: draftsCount, icon: 'file' },
        {
          id: 'archive',
          name: 'Archive',
          count: archiveCount,
          icon: 'archive',
        },
        { id: 'trash', name: 'Trash', count: trashCount, icon: 'trash' },
      ];
    } catch (error) {
      this.logger.error(`Failed to get mailboxes: ${error.message}`);
      throw new HttpException(
        'Error fetching mailboxes',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getEmailsByFolder(
    userId: string,
    folder: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<IEmailListResponse> {
    try {
      const skip = (page - 1) * limit;
      const filter: any = { accountId: userId };

      if (folder === 'starred') {
        filter.isStarred = true;
        filter.folder = { $ne: 'trash' };
      } else {
        filter.folder = folder;
      }

      const emails = await this.emailModel.find(filter);
      const sortedEmails = emails
        .sort(
          (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
        )
        .slice(skip, skip + limit);

      const total = emails.length;

      const emailList: IEmailPreview[] = sortedEmails.map((email) => ({
        id: email._id.toString(),
        from: email.from,
        to: email.to,
        subject: email.subject,
        preview: email.preview,
        isRead: email.isRead,
        isStarred: email.isStarred,
        sentAt: email.sentAt,
        folder: email.folder,
        hasAttachments: email.attachments && email.attachments.length > 0,
        labels: email.labels || [], // Include labels for Kanban functionality
        isSnoozed: email.isSnoozed || false, // Include snooze status
        snoozeUntil: email.snoozeUntil, // Include snooze timestamp
      }));

      return {
        emails: emailList,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(`Failed to get emails: ${error.message}`);
      throw new HttpException(
        'Error fetching emails',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getEmailById(userId: string, emailId: string): Promise<IEmailDetail | null> {
    try {
      if (!isValidObjectId(emailId)) {
        return null;
      }

      const email = await this.emailModel.findById(emailId);

      if (!email || email.accountId.toString() !== userId) {
        return null;
      }

      // Mark as read
      if (!email.isRead) {
        await this.emailModel.updateOne(
          { _id: emailId },
          { isRead: true, readAt: new Date() },
        );
      }

      return {
        id: email._id.toString(),
        from: email.from,
        to: email.to,
        cc: Array.isArray(email.cc) ? email.cc.join(', ') : email.cc,
        bcc: Array.isArray(email.bcc) ? email.bcc.join(', ') : email.bcc,
        subject: email.subject,
        body: email.body,
        preview: email.preview || generatePreview(email.body),
        isRead: true,
        isStarred: email.isStarred,
        sentAt: email.sentAt,
        readAt: email.readAt || new Date(),
        folder: email.folder,
        labels: email.labels || [], // Include labels for Kanban functionality
        attachments: email.attachments?.map((att: any) => ({
          id: att._id?.toString() || att.id,
          attachmentId: att.attachmentId || att._id?.toString(),
          filename: att.filename,
          originalName: att.originalName || att.filename,
          mimeType: att.mimeType,
          size: att.size,
          s3Key: att.s3Key,
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to get email by ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if email is internal (@hkt.com domain)
   */
  private isInternalEmail(email: string): boolean {
    return email.toLowerCase().endsWith(`@${this.INTERNAL_DOMAIN}`);
  }

  /**
   * Extract email address from "Name <email>" format
   */
  private extractEmailAddress(emailString: string): string {
    const match = emailString.match(/<([^>]+)>/);
    return match ? match[1].trim() : emailString.trim();
  }

  async sendEmail(
    userId: string,
    userEmail: string,
    to: string,
    subject: string,
    body: string,
    attachments?: Array<{ content: Buffer; filename: string; mimeType: string }>,
  ): Promise<{ success: boolean; messageId?: string }> {
    try {
      const recipientEmail = this.extractEmailAddress(to);
      const senderEmail = this.extractEmailAddress(userEmail);
      const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@${this.INTERNAL_DOMAIN}`;
      const now = new Date();

      // Get sender info
      const sender = await this.accountModel.findOne({ _id: userId });
      const senderName = sender?.username || senderEmail;

      // Save to sender's sent folder
      await this.emailModel.save({
        accountId: userId,
        from: `${senderName} <${senderEmail}>`,
        to: recipientEmail,
        subject,
        body,
        preview: generatePreview(body),
        folder: 'sent',
        isRead: true,
        isStarred: false,
        sentAt: now,
        messageId,
        attachments: attachments?.map(att => ({
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.content.length,
        })) || [],
      });

      this.logger.log(`Email saved to sent folder for user ${userId}`);

      // Check if recipient is internal (@hkt.com)
      if (this.isInternalEmail(recipientEmail)) {
        // Internal email - save directly to recipient's inbox
        const recipient = await this.accountModel.findOne({ email: recipientEmail });
        
        if (recipient) {
          await this.emailModel.save({
            accountId: recipient._id.toString(),
            from: `${senderName} <${senderEmail}>`,
            to: recipientEmail,
            subject,
            body,
            preview: generatePreview(body),
            folder: 'inbox',
            isRead: false,
            isStarred: false,
            sentAt: now,
            messageId,
            attachments: attachments?.map(att => ({
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.content.length,
            })) || [],
          });
          
          this.logger.log(`Internal email delivered to ${recipientEmail}`);
        } else {
          this.logger.warn(`Internal recipient ${recipientEmail} not found in system`);
        }
      } else {
        // External email - send via SMTP
        try {
          await this.dynamicMailService.sendWithSystemTransport({
            from: `${senderName} <${senderEmail}>`,
            to: recipientEmail,
            subject,
            html: body,
            attachments: attachments?.map(att => ({
              filename: att.filename,
              content: att.content,
              contentType: att.mimeType,
            })),
          });
          
          this.logger.log(`External email sent to ${recipientEmail} via SMTP`);
        } catch (smtpError) {
          this.logger.error(`SMTP send failed: ${smtpError.message}`);
          // Email is still saved in sent folder, just couldn't be delivered externally
          throw new HttpException(
            `Email saved but delivery failed: ${smtpError.message}`,
            HttpStatus.PARTIAL_CONTENT,
          );
        }
      }

      return { success: true, messageId };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to send email: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
    try {
      // Get original email
      const originalEmail = await this.emailModel.findById(emailId);
      if (!originalEmail) {
        throw new HttpException('Original email not found', HttpStatus.NOT_FOUND);
      }

      // Determine recipient (reply to sender of original email)
      const replyTo = this.extractEmailAddress(originalEmail.from);
      const replySubject = originalEmail.subject.startsWith('Re:') 
        ? originalEmail.subject 
        : `Re: ${originalEmail.subject}`;

      // Build reply body with quoted original
      const replyBody = `
        ${body}
        <br/><br/>
        <div style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 10px; color: #666;">
          <p>On ${new Date(originalEmail.sentAt).toLocaleString()}, ${originalEmail.from} wrote:</p>
          ${originalEmail.body}
        </div>
      `;

      return this.sendEmail(userId, userEmail, replyTo, replySubject, replyBody, attachments);
    } catch (error) {
      this.logger.error(`Failed to reply to email: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to reply: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async markAsRead(userId: string, emailId: string, isRead: boolean): Promise<boolean> {
    try {
      if (!isValidObjectId(emailId)) {
        return false;
      }

      await this.emailModel.updateOne(
        { _id: emailId, accountId: userId } as any,
        { isRead, readAt: isRead ? new Date() : null } as any,
      );

      return true;
    } catch (error) {
      this.logger.error(`Failed to mark email as read: ${error.message}`);
      return false;
    }
  }

  async toggleStar(userId: string, emailId: string): Promise<{ isStarred: boolean }> {
    try {
      if (!isValidObjectId(emailId)) {
        throw new HttpException('Invalid email ID', HttpStatus.BAD_REQUEST);
      }

      const email = await this.emailModel.findById(emailId);
      if (!email || email.accountId.toString() !== userId) {
        throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
      }

      const newStarredStatus = !email.isStarred;
      await this.emailModel.updateOne(
        { _id: emailId },
        { isStarred: newStarredStatus },
      );

      return { isStarred: newStarredStatus };
    } catch (error) {
      this.logger.error(`Failed to toggle star: ${error.message}`);
      throw error;
    }
  }

  async deleteEmail(userId: string, emailId: string): Promise<boolean> {
    try {
      if (!isValidObjectId(emailId)) {
        return false;
      }

      // Move to trash or permanent delete if already in trash
      const email = await this.emailModel.findById(emailId);
      if (!email || email.accountId.toString() !== userId) {
        return false;
      }

      if (email.folder === 'trash') {
        // Permanent delete
        await this.emailModel.deleteOne({ _id: emailId });
      } else {
        // Move to trash
        await this.emailModel.updateOne(
          { _id: emailId },
          { folder: 'trash', isStarred: false },
        );
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to delete email: ${error.message}`);
      return false;
    }
  }

  async moveToFolder(userId: string, emailId: string, folder: string): Promise<boolean> {
    try {
      if (!isValidObjectId(emailId)) {
        return false;
      }

      await this.emailModel.updateOne(
        { _id: emailId, accountId: userId } as any,
        { folder } as any,
      );

      return true;
    } catch (error) {
      this.logger.error(`Failed to move email to folder: ${error.message}`);
      return false;
    }
  }

  async addLabel(_userId: string, _emailId: string, _label: string): Promise<boolean> {
    // Label operations are Gmail-specific; noop for database provider
    return false;
  }

  async removeLabel(_userId: string, _emailId: string, _label: string): Promise<boolean> {
    return false;
  }

  async updateLabels(userId: string, emailId: string, labels: string[]): Promise<{ labels: string[] }> {
    // Update labels in database
    const objectId = isValidObjectId(emailId) ? emailId : null;
    
    if (!objectId) {
      this.logger.warn(`Invalid email ID for label update: ${emailId}`);
      return { labels: [] };
    }

    try {
      const result = await this.emailModel.updateOne(
        { _id: objectId, accountId: userId },
        { $set: { labels } },
      );

      if (result.modifiedCount > 0) {
        this.logger.log(`Updated labels for email ${emailId}`);
        return { labels };
      }

      return { labels: [] };
    } catch (error) {
      this.logger.error(`Failed to update labels for email ${emailId}:`, error);
      return { labels: [] };
    }
  }

  async getEmailIdsForFolder(
    userId: string,
    folder: string,
    filters?: EmailFilterOptions,
  ): Promise<string[]> {
    const query: any = { accountId: userId };

    if (folder === 'starred') {
      query.isStarred = true;
      query.folder = { $ne: 'trash' };
    } else if (folder && folder !== 'all') {
      query.folder = folder;
    }

    if (filters?.from) {
      query.from = { $regex: filters.from, $options: 'i' };
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
      query.sentAt = {};
      if (filters.startDate) {
        query.sentAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.sentAt.$lte = filters.endDate;
      }
    }

    if (filters?.search) {
      const regex = new RegExp(filters.search, 'i');
      query.$or = [{ subject: regex }, { from: regex }, { preview: regex }];
    }

    return this.emailModel.findMessageIds(query);
  }
}
