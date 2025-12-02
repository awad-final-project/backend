import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { EmailModel } from '../../libs/database/src/models';
import { AccountModel } from '../../libs/database/src/models';
import { SendEmailDto } from '../../libs/dtos';
import { faker } from '@faker-js/faker';
import { google } from 'googleapis';
import { ConfigService } from '@nestjs/config';
import { isValidObjectId } from 'mongoose';
import { MailService } from '../mailer';
import { AttachmentService } from './attachment.service';
import { IAttachmentRef } from '../../libs/database/src/schemas/email.schema';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly emailModel: EmailModel,
    private readonly accountModel: AccountModel,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly attachmentService: AttachmentService,
  ) {}

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

  private extractBody(payload: any): string {
    if (!payload) return '';

    let data = payload.body?.data;
    
    if (data) {
      // Handle base64url decoding manually to be safe across node versions
      data = data.replace(/-/g, '+').replace(/_/g, '/');
      // Pad with =
      while (data.length % 4) {
        data += '=';
      }
      return Buffer.from(data, 'base64').toString('utf-8');
    }
    
    if (payload.parts) {
      // Priority: text/html -> text/plain -> multipart/*
      let part = payload.parts.find((p: any) => p.mimeType === 'text/html');
      
      if (!part) {
        part = payload.parts.find((p: any) => p.mimeType === 'text/plain');
      }
      
      if (part) {
        return this.extractBody(part);
      }
      
      // If no direct text part, look into nested multiparts
      for (const p of payload.parts) {
        if (p.mimeType?.startsWith('multipart/')) {
          const body = this.extractBody(p);
          if (body) return body;
        }
      }
    }
    
    return '';
  }

  async getMailboxes(userId: string) {
    const gmail = await this.getGmailClient(userId);
    if (gmail) {
      try {
        const { data: { labels } } = await gmail.users.labels.list({ userId: 'me' });
        
        const getCount = (labelId: string, isUnread = false) => {
          const label = labels?.find(l => l.id === labelId);
          return isUnread ? label?.messagesUnread || 0 : label?.messagesTotal || 0;
        };

        return [
          { id: 'inbox', name: 'Inbox', count: getCount('INBOX', true), icon: 'inbox' },
          { id: 'starred', name: 'Starred', count: getCount('STARRED'), icon: 'star' },
          { id: 'sent', name: 'Sent', count: getCount('SENT'), icon: 'send' },
          { id: 'drafts', name: 'Drafts', count: getCount('DRAFT'), icon: 'file' },
          { id: 'archive', name: 'Archive', count: 0, icon: 'archive' },
          { id: 'trash', name: 'Trash', count: getCount('TRASH'), icon: 'trash' },
        ];
      } catch (error) {
        this.logger.warn(`Failed to fetch Gmail labels: ${error.message}`);
      }
    }

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
        { id: 'archive', name: 'Archive', count: archiveCount, icon: 'archive' },
        { id: 'trash', name: 'Trash', count: trashCount, icon: 'trash' },
      ];
    } catch (error) {
      this.logger.error(error);
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
  ) {
    const gmail = await this.getGmailClient(userId);
    if (gmail) {
      try {
        let labelId = 'INBOX';
        if (folder === 'sent') labelId = 'SENT';
        else if (folder === 'drafts') labelId = 'DRAFT';
        else if (folder === 'trash') labelId = 'TRASH';
        else if (folder === 'starred') labelId = 'STARRED';
        else if (folder === 'archive') labelId = undefined;

        const res = await gmail.users.messages.list({
          userId: 'me',
          labelIds: labelId ? [labelId] : undefined,
          maxResults: limit,
        });

        const messages = res.data.messages || [];
        const emailDetails = await Promise.all(messages.map(async (msg) => {
          const { data } = await gmail.users.messages.get({ userId: 'me', id: msg.id });
          const headers = data.payload.headers;
          const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
          const from = headers.find(h => h.name === 'From')?.value || '';
          const to = headers.find(h => h.name === 'To')?.value || '';
          const date = headers.find(h => h.name === 'Date')?.value;
          
          return {
            id: data.id,
            from,
            to,
            subject,
            preview: data.snippet,
            isRead: !data.labelIds.includes('UNREAD'),
            isStarred: data.labelIds.includes('STARRED'),
            sentAt: date ? new Date(date) : new Date(),
            folder: folder,
          };
        }));

        return {
          emails: emailDetails,
          total: res.data.resultSizeEstimate || 0,
          page,
          limit,
          totalPages: 1,
        };
      } catch (error) {
        this.logger.warn(`Failed to fetch Gmail emails: ${error.message}`);
      }
    }

    try {
      const skip = (page - 1) * limit;
      let filter: any = { accountId: userId };

      if (folder === 'starred') {
        filter.isStarred = true;
      } else {
        filter.folder = folder;
      }

      const emails = await this.emailModel.find(filter);
      const sortedEmails = emails
        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
        .slice(skip, skip + limit);

      const total = emails.length;

      return {
        emails: sortedEmails.map(email => ({
          id: email._id,
          from: email.from,
          to: email.to,
          subject: email.subject,
          preview: email.preview,
          isRead: email.isRead,
          isStarred: email.isStarred,
          sentAt: email.sentAt,
          folder: email.folder,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(
        'Error fetching emails',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getEmailById(userId: string, emailId: string) {
    const gmail = await this.getGmailClient(userId);
    if (gmail) {
      try {
        const { data } = await gmail.users.messages.get({ userId: 'me', id: emailId });
        const headers = data.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const to = headers.find(h => h.name === 'To')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value;
        
        const body = this.extractBody(data.payload) || data.snippet;

        if (data.labelIds.includes('UNREAD')) {
          await gmail.users.messages.modify({
            userId: 'me',
            id: emailId,
            requestBody: { removeLabelIds: ['UNREAD'] },
          });
        }

        return {
          id: data.id,
          from,
          to,
          subject,
          body,
          preview: data.snippet,
          isRead: true,
          isStarred: data.labelIds.includes('STARRED'),
          sentAt: date ? new Date(date) : new Date(),
          readAt: new Date(),
          folder: 'inbox',
        };
      } catch (error) {
        this.logger.error(`Failed to fetch Gmail email detail: ${error.message}`, error.stack);
        
        const statusCode = error.code || error.response?.status || 500;
        
        if (statusCode === 404) {
           throw new HttpException('Email not found in Gmail', HttpStatus.NOT_FOUND);
        }

        // If the ID is not a valid MongoDB ObjectId, it cannot be a local email.
        // So this error must be relevant to the user.
        if (!isValidObjectId(emailId)) {
            throw new HttpException(
                `Gmail API Error: ${error.message}`, 
                statusCode >= 100 && statusCode < 600 ? statusCode : HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
      }
    }

    try {
      if (!isValidObjectId(emailId)) {
        throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
      }

      const email = await this.emailModel.findById(emailId);

      if (!email) {
        throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
      }

      if (email.accountId.toString() !== userId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      // Mark as read if not already
      if (!email.isRead) {
        await this.emailModel.updateOne(
          { _id: emailId },
          { isRead: true, readAt: new Date() },
        );
      }

      return {
        id: email._id,
        from: email.from,
        to: email.to,
        subject: email.subject,
        body: email.body,
        preview: email.preview,
        isRead: true,
        isStarred: email.isStarred,
        sentAt: email.sentAt,
        readAt: email.readAt || new Date(),
        folder: email.folder,
      };
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error fetching email',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async sendEmail(userId: string, userEmail: string, data: SendEmailDto) {
    // Prepare attachments data for database
    const attachmentRefs: IAttachmentRef[] = data.attachments?.map(att => ({
      attachmentId: att.attachmentId,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
      s3Key: att.s3Key,
    })) || [];
    const hasAttachments = attachmentRefs.length > 0;

    // Get attachment content for sending via SMTP/Gmail
    const attachmentContents: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    if (hasAttachments) {
      for (const att of data.attachments || []) {
        try {
          const { content, filename, mimeType } = await this.attachmentService.getAttachmentContent(att.attachmentId);
          attachmentContents.push({ filename, content, contentType: mimeType });
        } catch (error) {
          this.logger.warn(`Failed to get attachment content: ${error.message}`);
        }
      }
    }

    const gmail = await this.getGmailClient(userId);
    if (gmail) {
      try {
        const subject = data.subject;
        const to = data.to;
        const body = data.htmlBody || data.body;
        
        this.logger.log(`Sending email via Gmail API: to=${to}, subject=${subject}, bodyLength=${body?.length}, hasAttachments=${hasAttachments}`);
        
        // Build MIME message
        const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        let messageParts: string[] = [];

        // Headers
        messageParts.push(`From: ${userEmail}`);
        messageParts.push(`To: ${to}`);
        if (data.cc?.length) {
          messageParts.push(`Cc: ${data.cc.join(', ')}`);
        }
        if (data.bcc?.length) {
          messageParts.push(`Bcc: ${data.bcc.join(', ')}`);
        }
        messageParts.push(`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`);
        messageParts.push('MIME-Version: 1.0');

        if (hasAttachments && attachmentContents.length > 0) {
          this.logger.log(`Building MIME message with ${attachmentContents.length} attachments`);
          
          messageParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
          messageParts.push('');
          messageParts.push(`--${boundary}`);
          messageParts.push('Content-Type: text/html; charset="UTF-8"');
          messageParts.push('Content-Transfer-Encoding: base64');
          messageParts.push('');
          messageParts.push(Buffer.from(body).toString('base64'));

          // Add attachments
          for (const att of attachmentContents) {
            this.logger.log(`Adding attachment: ${att.filename}, type=${att.contentType}, size=${att.content.length}`);
            messageParts.push(`--${boundary}`);
            messageParts.push(`Content-Type: ${att.contentType}; name="${att.filename}"`);
            messageParts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
            messageParts.push('Content-Transfer-Encoding: base64');
            messageParts.push('');
            messageParts.push(att.content.toString('base64'));
          }
          messageParts.push(`--${boundary}--`);
        } else {
          // Simple email without attachments
          messageParts.push('Content-Type: text/html; charset="UTF-8"');
          messageParts.push('Content-Transfer-Encoding: base64');
          messageParts.push('');
          messageParts.push(Buffer.from(body).toString('base64'));
        }

        const message = messageParts.join('\r\n');
        const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        
        this.logger.log(`Sending message, raw length: ${message.length}, encoded length: ${encodedMessage.length}`);

        const result = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage,
          },
        });
        
        this.logger.log(`Gmail API response: messageId=${result.data.id}, threadId=${result.data.threadId}`);

        return { message: 'Email sent successfully via Gmail', messageId: result.data.id };
      } catch (error) {
        this.logger.error(`Failed to send Gmail: ${error.message}`, error.stack);
      }
    }

    try {
      const preview = data.body.substring(0, 100);

      // Try to send via SMTP if configured
      try {
        await this.mailService.sendEmailWithAttachments(
          data.to,
          data.subject,
          data.htmlBody || data.body,
          attachmentContents,
        );
      } catch (smtpError) {
        this.logger.warn(`SMTP send failed (will still save to database): ${smtpError.message}`);
      }

      // Save to sender's sent folder
      const sentEmail = await this.emailModel.save({
        from: userEmail,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        body: data.body,
        htmlBody: data.htmlBody,
        preview,
        isRead: true,
        isStarred: false,
        folder: 'sent',
        sentAt: new Date(),
        accountId: userId,
        inReplyTo: data.inReplyTo,
        attachments: attachmentRefs,
        hasAttachments,
      });

      // Link attachments to the email
      if (hasAttachments) {
        const attachmentIds = data.attachments?.map(att => att.attachmentId) || [];
        await this.attachmentService.linkAttachmentsToEmail(attachmentIds, sentEmail._id.toString());
      }

      // Check if recipient exists in our system
      const recipient = await this.accountModel.findOne({ email: data.to });
      if (recipient) {
        // Save to recipient's inbox
        const inboxEmail = await this.emailModel.save({
          from: userEmail,
          to: data.to,
          cc: data.cc,
          bcc: data.bcc,
          subject: data.subject,
          body: data.body,
          htmlBody: data.htmlBody,
          preview,
          isRead: false,
          isStarred: false,
          folder: 'inbox',
          sentAt: new Date(),
          accountId: recipient._id as string,
          inReplyTo: data.inReplyTo,
          attachments: attachmentRefs,
          hasAttachments,
        });

        // Link attachments to recipient's email copy as well
        if (hasAttachments) {
          const attachmentIds = data.attachments?.map(att => att.attachmentId) || [];
          await this.attachmentService.linkAttachmentsToEmail(attachmentIds, inboxEmail._id.toString());
        }
      }

      return { message: 'Email sent successfully' };
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(
        'Error sending email',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async toggleStar(userId: string, emailId: string) {
    const gmail = await this.getGmailClient(userId);
    if (gmail) {
      try {
        const { data } = await gmail.users.messages.get({ userId: 'me', id: emailId });
        const isStarred = data.labelIds.includes('STARRED');
        
        if (isStarred) {
          await gmail.users.messages.modify({
            userId: 'me',
            id: emailId,
            requestBody: { removeLabelIds: ['STARRED'] },
          });
        } else {
          await gmail.users.messages.modify({
            userId: 'me',
            id: emailId,
            requestBody: { addLabelIds: ['STARRED'] },
          });
        }
        return { message: 'Email starred status updated', isStarred: !isStarred };
      } catch (error) {
        this.logger.warn(`Failed to toggle star on Gmail: ${error.message}`);
      }
    }

    try {
      const email = await this.emailModel.findById(emailId);

      if (!email) {
        throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
      }

      if (email.accountId.toString() !== userId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      await this.emailModel.updateOne(
        { _id: emailId },
        { isStarred: !email.isStarred },
      );

      return { message: 'Email starred status updated', isStarred: !email.isStarred };
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error updating email',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async markAsRead(userId: string, emailId: string, isRead: boolean) {
    const gmail = await this.getGmailClient(userId);
    if (gmail) {
      try {
        if (isRead) {
          await gmail.users.messages.modify({
            userId: 'me',
            id: emailId,
            requestBody: { removeLabelIds: ['UNREAD'] },
          });
        } else {
          await gmail.users.messages.modify({
            userId: 'me',
            id: emailId,
            requestBody: { addLabelIds: ['UNREAD'] },
          });
        }
        return { message: 'Email read status updated', isRead };
      } catch (error) {
        this.logger.warn(`Failed to mark as read on Gmail: ${error.message}`);
      }
    }

    try {
      const email = await this.emailModel.findById(emailId);

      if (!email) {
        throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
      }

      if (email.accountId.toString() !== userId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const update: any = { isRead };
      if (isRead && !email.readAt) {
        update.readAt = new Date();
      }

      await this.emailModel.updateOne({ _id: emailId }, update);

      return { message: 'Email read status updated', isRead };
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error updating email',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteEmail(userId: string, emailId: string) {
    const gmail = await this.getGmailClient(userId);
    if (gmail) {
      try {
        await gmail.users.messages.trash({ userId: 'me', id: emailId });
        return { message: 'Email moved to trash' };
      } catch (error) {
        this.logger.warn(`Failed to delete Gmail: ${error.message}`);
      }
    }

    try {
      const email = await this.emailModel.findById(emailId);

      if (!email) {
        throw new HttpException('Email not found', HttpStatus.NOT_FOUND);
      }

      if (email.accountId.toString() !== userId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      if (email.folder === 'trash') {
        // Permanently delete
        await this.emailModel.deleteOne({ _id: emailId });
        return { message: 'Email permanently deleted' };
      } else {
        // Move to trash
        await this.emailModel.updateOne({ _id: emailId }, { folder: 'trash' });
        return { message: 'Email moved to trash' };
      }
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error deleting email',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async seedMockEmails(userId: string, userEmail: string) {
    try {
      // Check if user already has emails
      const existingEmails = await this.emailModel.countDocuments({ accountId: userId });
      if (existingEmails > 0) {
        return { message: 'Mock emails already exist for this user' };
      }

      const mockEmails = [];
      const folders = ['inbox', 'sent', 'drafts', 'archive'];

      // Create 30 mock emails
      for (let i = 0; i < 30; i++) {
        const isIncoming = Math.random() > 0.5;
        const folder = folders[Math.floor(Math.random() * folders.length)];
        const body = faker.lorem.paragraphs(3);
        
        mockEmails.push({
          from: isIncoming ? faker.internet.email() : userEmail,
          to: isIncoming ? userEmail : faker.internet.email(),
          subject: faker.lorem.sentence(),
          body,
          preview: body.substring(0, 100),
          isRead: Math.random() > 0.3,
          isStarred: Math.random() > 0.8,
          folder: isIncoming ? 'inbox' : folder,
          sentAt: faker.date.recent({ days: 30 }),
          accountId: userId,
        });
      }

      for (const email of mockEmails) {
        await this.emailModel.save(email);
      }

      return { message: `Successfully seeded ${mockEmails.length} mock emails` };
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(
        'Error seeding mock emails',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
