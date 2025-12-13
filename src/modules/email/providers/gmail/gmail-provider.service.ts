import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';
import { AccountModel } from '@database/models';
import {
  IEmailProvider,
  IEmailDetail,
  IEmailListResponse,
  IEmailPreview,
  IMailbox,
  EmailFilterOptions,
} from '@email/common/interfaces';
import {
  extractBodyFromPayload,
  extractEmailAddress,
  mapFolderToGmailLabel,
  generatePreview,
  extractAttachmentsFromPayload,
} from '@email/common/utils/email.utils';

/**
 * Gmail Provider Service
 * Implements IEmailProvider for Gmail API integration
 * Following Single Responsibility Principle - only handles Gmail operations
 */
@Injectable()
export class GmailProviderService implements IEmailProvider {
  private readonly logger = new Logger(GmailProviderService.name);
  private readonly labelCache = new Map<string, Map<string, string>>();

  constructor(
    private readonly accountModel: AccountModel,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get authenticated Gmail client for user with automatic token refresh
   */
  private async getGmailClient(userId: string) {
    const user = await this.accountModel.findOne({ _id: userId });
    if (!user || !user.googleAccessToken) {
      this.logger.warn(`No Google access token found for user ${userId}`);
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_CALLBACK_URL'),
    );

    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
    });

    // Set up token refresh handler
    oauth2Client.on('tokens', async (tokens) => {
      this.logger.log(`Tokens refreshed for user ${userId}`);
      if (tokens.access_token) {
        // Update the access token in database
        user.googleAccessToken = tokens.access_token;
        await this.accountModel.save(user);
      }
      if (tokens.refresh_token) {
        // Update refresh token if a new one is provided
        user.googleRefreshToken = tokens.refresh_token;
        await this.accountModel.save(user);
      }
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
          count: getCount('STARRED', true),
          icon: 'star',
        },
        { id: 'sent', name: 'Sent', count: getCount('SENT', true), icon: 'send' },
        {
          id: 'drafts',
          name: 'Drafts',
          count: getCount('DRAFT', true),
          icon: 'file',
        },
        { id: 'archive', name: 'Archive', count: 0, icon: 'archive' },
        {
          id: 'trash',
          name: 'Trash',
          count: getCount('TRASH', true),
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
      this.logger.error(`Gmail client not available for user ${userId}`);
      throw new Error('Gmail not available for this user');
    }

    try {
      const labelId = mapFolderToGmailLabel(folder);
      this.logger.debug(`Fetching emails for user ${userId}, folder: ${folder}, labelId: ${labelId}, page: ${page}`);

      // Gmail API uses pageToken for pagination, not offset
      // Iterate through pages to reach requested page
      let currentPage = 1;
      let pageToken: string | undefined = undefined;
      let res: any = null;

      // Fetch pages sequentially until we reach the requested page
      while (currentPage <= page) {
        try {
          res = await gmail.users.messages.list({
            userId: 'me',
            labelIds: labelId ? [labelId] : undefined,
            maxResults: limit,
            pageToken: pageToken,
          });
        } catch (error: any) {
          if (error.code === 401 || error.message?.includes('invalid_grant')) {
            this.logger.error(`Authentication error for user ${userId}: ${error.message}`);
            throw new Error('Gmail authentication expired. Please re-authenticate with Google.');
          }
          throw error;
        }
        
        // If we reached the target page, stop
        if (currentPage === page) {
          break;
        }
        
        // Get next page token for next iteration
        pageToken = res.data.nextPageToken;
        if (!pageToken) {
          // No more pages available, requested page doesn't exist
          return {
            emails: [],
            total: res.data.resultSizeEstimate || 0,
            page,
            limit,
            totalPages: currentPage, // Last available page
            hasMore: false,
          };
        }
        
        currentPage++;
      }
      
      // Ensure we have data
      if (!res) {
        throw new Error('Failed to fetch emails from Gmail');
      }

      this.logger.debug(`Fetched ${res.data.messages?.length || 0} messages for user ${userId}`);

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

          // Extract custom labels (exclude system labels)
          const systemLabels = ['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'UNREAD', 'STARRED', 'IMPORTANT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];
          const allLabelIds = data.labelIds || [];
          const customLabelIds = allLabelIds.filter(labelId => !systemLabels.includes(labelId));
          
          const customLabels = customLabelIds.map(labelId => {
            // Try to get label name from cache or use ID
            const labelName = this.getLabelNameFromCache(userId, labelId);
            return labelName || labelId;
          });

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
            labels: customLabels.length > 0 ? customLabels : [], // Always return array, never undefined
          };
        }),
      );

      const total = res.data.resultSizeEstimate || 0;
      const hasMore = !!res.data.nextPageToken;
      
      // Calculate estimated total pages based on total count
      const estimatedTotalPages = total > 0 ? Math.ceil(total / limit) : 1;
      
      return {
        emails,
        total,
        page,
        limit,
        // Use estimated total pages from count, not hasMore flag
        totalPages: estimatedTotalPages,
        nextPageToken: res.data.nextPageToken,
        hasMore,
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

      // Extract attachments
      const gmailAttachments = extractAttachmentsFromPayload(data.payload);

      // Mark as read
      if (data.labelIds.includes('UNREAD')) {
        await gmail.users.messages.modify({
          userId: 'me',
          id: emailId,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });
      }

      // Extract custom labels (exclude system labels)
      const systemLabels = ['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'UNREAD', 'STARRED', 'IMPORTANT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];
      const customLabels = (data.labelIds || [])
        .filter(labelId => !systemLabels.includes(labelId))
        .map(labelId => {
          const labelName = this.getLabelNameFromCache(userId, labelId);
          return labelName || labelId;
        });

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
        labels: customLabels,
        attachments: gmailAttachments.map((att) => ({
          id: att.attachmentId,
          attachmentId: att.attachmentId,
          filename: att.filename,
          originalName: att.filename,
          mimeType: att.mimeType,
          size: att.size,
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Gmail email: ${error.message}`);
      return null;
    }
  }

  async getEmailIdsForFolder(
    userId: string,
    folder: string,
    filters?: EmailFilterOptions,
  ): Promise<string[]> {
    const gmail = await this.getGmailClient(userId);
    if (!gmail) {
      throw new Error('Gmail not available for this user');
    }

    const labelId = mapFolderToGmailLabel(folder);
    const query = this.buildGmailQuery(filters);
    const ids: string[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const response = await gmail.users.messages.list({
        userId: 'me',
        labelIds: labelId ? [labelId] : undefined,
        q: query || undefined,
        maxResults: 500,
        pageToken,
      });

      if (response.data.messages?.length) {
        response.data.messages.forEach((message) => {
          if (message.id) {
            ids.push(message.id);
          }
        });
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return ids;
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
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: emailId,
        format: 'metadata',
        metadataHeaders: [],
      });

      const isInTrash = data.labelIds?.includes('TRASH');

      if (isInTrash) {
        await gmail.users.messages.delete({
          userId: 'me',
          id: emailId,
        });
      } else {
        await gmail.users.messages.trash({
          userId: 'me',
          id: emailId,
        });
      }

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

  async addLabel(userId: string, emailId: string, label: string): Promise<boolean> {
    if (!label) {
      return false;
    }

    const gmail = await this.getGmailClient(userId);
    if (!gmail) {
      return false;
    }

    try {
      const labelId = await this.resolveLabelId(gmail, userId, label, true);
      if (!labelId) {
        return false;
      }

      await gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: { addLabelIds: [labelId] },
      });

      return true;
    } catch (error) {
      this.logger.warn(`Failed to add label ${label} to email ${emailId}: ${error.message}`);
      return false;
    }
  }

  async removeLabel(userId: string, emailId: string, label: string): Promise<boolean> {
    if (!label) {
      return false;
    }

    const gmail = await this.getGmailClient(userId);
    if (!gmail) {
      return false;
    }

    try {
      const labelId = await this.resolveLabelId(gmail, userId, label, false);
      if (!labelId) {
        return false;
      }

      await gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: { removeLabelIds: [labelId] },
      });

      return true;
    } catch (error) {
      this.logger.warn(`Failed to remove label ${label} from email ${emailId}: ${error.message}`);
      return false;
    }
  }

  async updateLabels(userId: string, emailId: string, labels: string[]): Promise<{ labels: string[] }> {
    const gmail = await this.getGmailClient(userId);
    if (!gmail) {
      this.logger.warn(`Gmail client not available for user ${userId}`);
      return { labels: [] };
    }

    try {
      // Get current message to see existing labels
      const { data: message } = await gmail.users.messages.get({
        userId: 'me',
        id: emailId,
        format: 'metadata',
        metadataHeaders: [],
      });

      const currentLabelIds = message.labelIds || [];
      
      // Filter out system labels (INBOX, STARRED, TRASH, etc.) - we don't want to modify those
      const systemLabels = ['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'UNREAD', 'STARRED', 'IMPORTANT'];
      const currentCustomLabels = currentLabelIds.filter(id => !systemLabels.includes(id));

      // Resolve new label IDs (create if they don't exist)
      const newLabelIds: string[] = [];
      for (const label of labels) {
        if (!label) continue;
        const labelId = await this.resolveLabelId(gmail, userId, label, true);
        if (labelId && !systemLabels.includes(labelId)) {
          newLabelIds.push(labelId);
        }
      }

      // Calculate which labels to add and remove
      const labelsToAdd = newLabelIds.filter(id => !currentCustomLabels.includes(id));
      const labelsToRemove = currentCustomLabels.filter(id => !newLabelIds.includes(id));

      // Only make API call if there are changes
      if (labelsToAdd.length > 0 || labelsToRemove.length > 0) {
        await gmail.users.messages.modify({
          userId: 'me',
          id: emailId,
          requestBody: {
            addLabelIds: labelsToAdd,
            removeLabelIds: labelsToRemove,
          },
        });

        this.logger.log(`Updated labels for email ${emailId}: +${labelsToAdd.length}, -${labelsToRemove.length}`);
      }

      return { labels };
    } catch (error) {
      this.logger.error(`Failed to update labels for email ${emailId}:`, error);
      return { labels: [] };
    }
  }

  private async resolveLabelId(
    gmail: gmail_v1.Gmail,
    userId: string,
    labelName: string,
    createIfMissing: boolean,
  ): Promise<string | null> {
    const normalizedKey = labelName.trim();
    if (!normalizedKey) {
      return null;
    }

    const key = normalizedKey.toUpperCase();
    const cachedKey = this.labelCache.get(userId)?.get(key);
    if (cachedKey) {
      return cachedKey;
    }

    const {
      data: { labels },
    } = await gmail.users.labels.list({ userId: 'me' });

    const existing = labels?.find(
      (label) =>
        label.id === normalizedKey ||
        label.id === key ||
        label.name?.toUpperCase() === key,
    );

    if (existing?.id) {
      this.cacheLabelId(userId, key, existing.id);
      return existing.id;
    }

    if (!createIfMissing) {
      return null;
    }

    try {
      const { data } = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: normalizedKey,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });

      if (data.id) {
        this.cacheLabelId(userId, key, data.id);
        return data.id;
      }
    } catch (error) {
      this.logger.warn(`Unable to create Gmail label ${labelName}: ${error.message}`);
    }

    return null;
  }

  private cacheLabelId(userId: string, key: string, labelId: string): void {
    if (!this.labelCache.has(userId)) {
      this.labelCache.set(userId, new Map());
    }
    this.labelCache.get(userId)!.set(key, labelId);
  }

  private getLabelNameFromCache(userId: string, labelId: string): string | null {
    const userCache = this.labelCache.get(userId);
    if (!userCache) return null;
    
    // Reverse lookup: find key by value
    for (const [key, cachedId] of userCache.entries()) {
      if (cachedId === labelId) {
        // Return the original case-sensitive label name
        return key.toLowerCase();
      }
    }
    
    return null;
  }

  async downloadAttachment(userId: string, emailId: string, attachmentId: string): Promise<{
    buffer: Buffer;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    const gmail = await this.getGmailClient(userId);
    if (!gmail) {
      throw new Error('Gmail not available for this user');
    }

    try {
      // First get the email to find attachment metadata
      const { data: messageData } = await gmail.users.messages.get({
        userId: 'me',
        id: emailId,
      });

      this.logger.debug(`Looking for attachment ${attachmentId} in email ${emailId}`);

      // Helper function to recursively find ALL attachments
      const allAttachments: any[] = [];
      const collectAllAttachments = (parts: any[]): void => {
        if (!parts || !Array.isArray(parts)) return;
        
        for (const part of parts) {
          // Check if this part has an attachment
          if (part.body && part.body.attachmentId && part.filename) {
            allAttachments.push({
              part,
              attachmentId: part.body.attachmentId,
              filename: part.filename,
              mimeType: part.mimeType,
              size: part.body.size,
            });
          }
          
          // Recursively check nested parts
          if (part.parts && Array.isArray(part.parts)) {
            collectAllAttachments(part.parts);
          }
        }
      };

      // Collect all attachments from the email
      if (messageData.payload.parts) {
        collectAllAttachments(messageData.payload.parts);
      }
      
      // Check if payload itself is an attachment
      if (messageData.payload.body && messageData.payload.body.attachmentId && messageData.payload.filename) {
        allAttachments.push({
          part: messageData.payload,
          attachmentId: messageData.payload.body.attachmentId,
          filename: messageData.payload.filename,
          mimeType: messageData.payload.mimeType,
          size: messageData.payload.body.size,
        });
      }

      if (allAttachments.length === 0) {
        throw new Error('No attachments found in this email');
      }

      this.logger.debug(`Found ${allAttachments.length} attachments in email`);

      // Try to find by exact attachmentId first
      let targetAttachment = allAttachments.find(a => a.attachmentId === attachmentId);
      
      // If not found (attachmentId changed), use the first attachment if there's only one
      // or try to match by comparing the beginning of the ID (they often share a prefix)
      if (!targetAttachment) {
        this.logger.warn(`Exact attachmentId not found. Looking for similar attachment...`);
        
        if (allAttachments.length === 1) {
          // If there's only one attachment, use it
          this.logger.debug(`Only one attachment found, using it`);
          targetAttachment = allAttachments[0];
        } else {
          // Try to find by comparing ID prefix (first 20 chars)
          const idPrefix = attachmentId.substring(0, 20);
          targetAttachment = allAttachments.find(a => a.attachmentId.startsWith(idPrefix));
          
          if (!targetAttachment) {
            // Last resort: use first attachment
            this.logger.warn(`Could not match attachment, using first one`);
            targetAttachment = allAttachments[0];
          }
        }
      }

      const actualAttachmentId = targetAttachment.attachmentId;
      this.logger.debug(`Using attachment: ${targetAttachment.filename} (ID: ${actualAttachmentId.substring(0, 30)}...)`);

      // Download the attachment using the ACTUAL attachmentId from the current fetch
      const { data: attachmentData } = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: emailId,
        id: actualAttachmentId,
      });

      if (!attachmentData || !attachmentData.data) {
        throw new Error('No attachment data returned from Gmail API');
      }

      // Decode Base64URL data (Gmail uses URL-safe Base64)
      // Convert Base64URL to standard Base64
      let base64Data = attachmentData.data;
      base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/');
      
      // Add padding if needed
      while (base64Data.length % 4) {
        base64Data += '=';
      }

      const buffer = Buffer.from(base64Data, 'base64');

      this.logger.debug(`Successfully decoded attachment: ${targetAttachment.filename}, size: ${buffer.length} bytes`);

      return {
        buffer,
        filename: targetAttachment.filename || 'attachment',
        mimeType: targetAttachment.mimeType || 'application/octet-stream',
        size: buffer.length,
      };
    } catch (error) {
      this.logger.error(`Failed to download Gmail attachment: ${error.message}`);
      throw error;
    }
  }

  private buildGmailQuery(filters?: EmailFilterOptions): string {
    if (!filters) return '';
    const parts: string[] = [];

    if (filters.search) {
      parts.push(filters.search);
    }
    if (filters.from) {
      parts.push(`from:${filters.from}`);
    }
    if (filters.unread) {
      parts.push('is:unread');
    }
    if (filters.starred) {
      parts.push('is:starred');
    }
    if (filters.hasAttachments) {
      parts.push('has:attachment');
    }
    if (filters.startDate) {
      parts.push(`after:${this.formatDateForQuery(filters.startDate)}`);
    }
    if (filters.endDate) {
      parts.push(`before:${this.formatDateForQuery(filters.endDate)}`);
    }

    return parts.join(' ').trim();
  }

  private formatDateForQuery(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}/${month}/${day}`;
  }
}
