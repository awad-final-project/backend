import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { AccountModel } from '@database/models';
import {
  IEmailProvider,
  IEmailDetail,
  IEmailListResponse,
  IEmailPreview,
  IMailbox,
} from '@email/common/interfaces';
import {
  extractBodyFromPayload,
  extractEmailAddress,
  mapFolderToGmailLabel,
  generatePreview,
} from '@email/common/utils/email.utils';

/**
 * Gmail Provider Service
 * Implements IEmailProvider for Gmail API integration
 * Following Single Responsibility Principle - only handles Gmail operations
 */
@Injectable()
export class GmailProviderService implements IEmailProvider {
  private readonly logger = new Logger(GmailProviderService.name);

  constructor(
    private readonly accountModel: AccountModel,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get authenticated Gmail client for user
   */
  private async getGmailClient(userId: string) {
    const user = await this.accountModel.findOne({ _id: userId });
    if (!user || !user.googleAccessToken) return null;

    const oauth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_CALLBACK_URL'),
    );

    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  async isAvailable(userId: string): Promise<boolean> {
    const gmail = await this.getGmailClient(userId);
    return gmail !== null;
  }

  async getMailboxes(userId: string): Promise<IMailbox[]> {
    const gmail = await this.getGmailClient(userId);
    if (!gmail) {
      throw new Error('Gmail not available for this user');
    }

    try {
      const {
        data: { labels },
      } = await gmail.users.labels.list({ userId: 'me' });

      const getCount = (labelId: string, isUnread = false) => {
        const label = labels?.find((l) => l.id === labelId);
        return isUnread
          ? label?.messagesUnread || 0
          : label?.messagesTotal || 0;
      };

      return [
        {
          id: 'inbox',
          name: 'Inbox',
          count: getCount('INBOX', true),
          icon: 'inbox',
        },
        {
          id: 'starred',
          name: 'Starred',
          count: getCount('STARRED'),
          icon: 'star',
        },
        { id: 'sent', name: 'Sent', count: getCount('SENT'), icon: 'send' },
        {
          id: 'drafts',
          name: 'Drafts',
          count: getCount('DRAFT'),
          icon: 'file',
        },
        { id: 'archive', name: 'Archive', count: 0, icon: 'archive' },
        {
          id: 'trash',
          name: 'Trash',
          count: getCount('TRASH'),
          icon: 'trash',
        },
      ];
    } catch (error) {
      this.logger.error(`Failed to fetch Gmail labels: ${error.message}`);
      throw error;
    }
  }

  async getEmailsByFolder(
    userId: string,
    folder: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<IEmailListResponse> {
    const gmail = await this.getGmailClient(userId);
    if (!gmail) {
      throw new Error('Gmail not available for this user');
    }

    try {
      const labelId = mapFolderToGmailLabel(folder);

      const res = await gmail.users.messages.list({
        userId: 'me',
        labelIds: labelId ? [labelId] : undefined,
        maxResults: limit,
      });

      const messages = res.data.messages || [];
      const emails: IEmailPreview[] = await Promise.all(
        messages.map(async (msg) => {
          const { data } = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
          });
          const headers = data.payload.headers;
          const subject =
            headers.find((h) => h.name === 'Subject')?.value ||
            '(No Subject)';
          const from = headers.find((h) => h.name === 'From')?.value || '';
          const to = headers.find((h) => h.name === 'To')?.value || '';
          const date = headers.find((h) => h.name === 'Date')?.value;

          return {
            id: data.id,
            from: extractEmailAddress(from),
            to: extractEmailAddress(to),
            subject,
            preview: data.snippet || '',
            isRead: !data.labelIds.includes('UNREAD'),
            isStarred: data.labelIds.includes('STARRED'),
            sentAt: date ? new Date(date) : new Date(),
            folder: folder,
            hasAttachments: data.payload.parts?.some(
              (part) => part.filename && part.filename.length > 0,
            ),
          };
        }),
      );

      const total = res.data.resultSizeEstimate || 0;
      return {
        emails,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Gmail emails: ${error.message}`);
      throw error;
    }
  }

  async getEmailById(userId: string, emailId: string): Promise<IEmailDetail | null> {
    const gmail = await this.getGmailClient(userId);
    if (!gmail) {
      throw new Error('Gmail not available for this user');
    }

    try {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: emailId,
      });
      
      const headers = data.payload.headers;
      const subject =
        headers.find((h) => h.name === 'Subject')?.value || '(No Subject)';
      const from = headers.find((h) => h.name === 'From')?.value || '';
      const to = headers.find((h) => h.name === 'To')?.value || '';
      const cc = headers.find((h) => h.name === 'Cc')?.value;
      const date = headers.find((h) => h.name === 'Date')?.value;

      const body = extractBodyFromPayload(data.payload) || data.snippet;

      // Mark as read
      if (data.labelIds.includes('UNREAD')) {
        await gmail.users.messages.modify({
          userId: 'me',
          id: emailId,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });
      }

      return {
        id: data.id,
        from: extractEmailAddress(from),
        to: extractEmailAddress(to),
        cc,
        subject,
        body,
        preview: data.snippet || generatePreview(body),
        isRead: true,
        isStarred: data.labelIds.includes('STARRED'),
        sentAt: date ? new Date(date) : new Date(),
        readAt: new Date(),
        folder: 'inbox',
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Gmail email: ${error.message}`);
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
    const gmail = await this.getGmailClient(userId);
    if (!gmail) {
      throw new Error('Gmail not available for this user');
    }

    try {
      // Build email content
      const boundary = '----=_Part_' + Date.now();
      let emailContent = [
        `From: ${userEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        '',
        body,
      ];

      // Add attachments if any
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          emailContent.push(`--${boundary}`);
          emailContent.push(
            `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
          );
          emailContent.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
          emailContent.push(`Content-Transfer-Encoding: base64`);
          emailContent.push('');
          emailContent.push(attachment.content.toString('base64'));
        }
      }

      emailContent.push(`--${boundary}--`);

      const raw = Buffer.from(emailContent.join('\r\n'))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });

      return { success: true, messageId: result.data.id };
    } catch (error) {
      this.logger.error(`Failed to send Gmail email: ${error.message}`);
      throw error;
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
    const gmail = await this.getGmailClient(userId);
    if (!gmail) {
      throw new Error('Gmail not available for this user');
    }

    try {
      // Get original email
      const { data: originalEmail } = await gmail.users.messages.get({
        userId: 'me',
        id: emailId,
      });

      const headers = originalEmail.payload.headers;
      const originalFrom = headers.find((h) => h.name === 'From')?.value || '';
      const originalTo = headers.find((h) => h.name === 'To')?.value || '';
      const originalCc = headers.find((h) => h.name === 'Cc')?.value;
      const originalSubject = headers.find((h) => h.name === 'Subject')?.value || '';
      const messageId = headers.find((h) => h.name === 'Message-ID')?.value;

      let to = extractEmailAddress(originalFrom);
      let cc = '';

      if (replyAll) {
        const toList = originalTo.split(',').map((email) => extractEmailAddress(email.trim()));
        const ccList = originalCc ? originalCc.split(',').map((email) => extractEmailAddress(email.trim())) : [];
        
        // Remove user's own email
        const allRecipients = [...toList, ...ccList].filter((email) => email !== userEmail);
        to = extractEmailAddress(originalFrom);
        cc = allRecipients.join(', ');
      }

      const subject = originalSubject.startsWith('Re:')
        ? originalSubject
        : `Re: ${originalSubject}`;

      // Build email
      const boundary = '----=_Part_' + Date.now();
      let emailContent = [
        `From: ${userEmail}`,
        `To: ${to}`,
      ];

      if (cc) {
        emailContent.push(`Cc: ${cc}`);
      }

      emailContent.push(
        `Subject: ${subject}`,
        `In-Reply-To: ${messageId}`,
        `References: ${messageId}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        '',
        body,
      );

      // Add attachments
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          emailContent.push(`--${boundary}`);
          emailContent.push(
            `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
          );
          emailContent.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
          emailContent.push(`Content-Transfer-Encoding: base64`);
          emailContent.push('');
          emailContent.push(attachment.content.toString('base64'));
        }
      }

      emailContent.push(`--${boundary}--`);

      const raw = Buffer.from(emailContent.join('\r\n'))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          threadId: originalEmail.threadId,
        },
      });

      return { success: true, messageId: result.data.id };
    } catch (error) {
      this.logger.error(`Failed to reply to Gmail email: ${error.message}`);
      throw error;
    }
  }

  async markAsRead(userId: string, emailId: string, isRead: boolean): Promise<boolean> {
    const gmail = await this.getGmailClient(userId);
    if (!gmail) return false;

    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: isRead
          ? { removeLabelIds: ['UNREAD'] }
          : { addLabelIds: ['UNREAD'] },
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to mark email as read: ${error.message}`);
      return false;
    }
  }

  async toggleStar(userId: string, emailId: string): Promise<{ isStarred: boolean }> {
    const gmail = await this.getGmailClient(userId);
    if (!gmail) {
      throw new Error('Gmail not available for this user');
    }

    try {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: emailId,
      });

      const isStarred = data.labelIds.includes('STARRED');

      await gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: isStarred
          ? { removeLabelIds: ['STARRED'] }
          : { addLabelIds: ['STARRED'] },
      });

      return { isStarred: !isStarred };
    } catch (error) {
      this.logger.error(`Failed to toggle star: ${error.message}`);
      throw error;
    }
  }

  async deleteEmail(userId: string, emailId: string): Promise<boolean> {
    const gmail = await this.getGmailClient(userId);
    if (!gmail) return false;

    try {
      await gmail.users.messages.trash({
        userId: 'me',
        id: emailId,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete email: ${error.message}`);
      return false;
    }
  }

  async moveToFolder(userId: string, emailId: string, folder: string): Promise<boolean> {
    const gmail = await this.getGmailClient(userId);
    if (!gmail) return false;

    try {
      const newLabel = mapFolderToGmailLabel(folder);
      if (!newLabel) return false;

      await gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: {
          addLabelIds: [newLabel],
        },
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to move email to folder: ${error.message}`);
      return false;
    }
  }
}
