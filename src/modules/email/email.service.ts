import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { EmailModel } from '../../libs/database/src/models';
import { AccountModel } from '../../libs/database/src/models';
import { SendEmailDto, ReplyEmailDto, ModifyEmailDto } from '../../libs/dtos';
import { faker } from '@faker-js/faker';
import { google } from 'googleapis';
import { ConfigService } from '@nestjs/config';
import { isValidObjectId } from 'mongoose';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly emailModel: EmailModel,
    private readonly accountModel: AccountModel,
    private readonly configService: ConfigService,
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

  private extractEmailAddress(emailString: string): string {
    if (!emailString) return '';

    // Match format: "Name" <email@example.com>
    const match = emailString.match(/<([^>]+)>/);
    if (match) {
      return match[1].trim();
    }

    // If no match, assume it's already a plain email address
    return emailString.trim();
  }

  async getMailboxes(userId: string) {
    const gmail = await this.getGmailClient(userId);
    if (gmail) {
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
        {
          id: 'archive',
          name: 'Archive',
          count: archiveCount,
          icon: 'archive',
        },
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
        const emailDetails = await Promise.all(
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
              from,
              to,
              subject,
              preview: data.snippet,
              isRead: !data.labelIds.includes('UNREAD'),
              isStarred: data.labelIds.includes('STARRED'),
              sentAt: date ? new Date(date) : new Date(),
              folder: folder,
            };
          }),
        );

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
      const filter: any = { accountId: userId };

      if (folder === 'starred') {
        filter.isStarred = true;
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

      return {
        emails: sortedEmails.map((email) => ({
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
        const { data } = await gmail.users.messages.get({
          userId: 'me',
          id: emailId,
        });
        const headers = data.payload.headers;
        const subject =
          headers.find((h) => h.name === 'Subject')?.value || '(No Subject)';
        const from = headers.find((h) => h.name === 'From')?.value || '';
        const to = headers.find((h) => h.name === 'To')?.value || '';
        const date = headers.find((h) => h.name === 'Date')?.value;

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
        this.logger.error(
          `Failed to fetch Gmail email detail: ${error.message}`,
          error.stack,
        );

        const statusCode = error.code || error.response?.status || 500;

        if (statusCode === 404) {
          throw new HttpException(
            'Email not found in Gmail',
            HttpStatus.NOT_FOUND,
          );
        }

        // If the ID is not a valid MongoDB ObjectId, it cannot be a local email.
        // So this error must be relevant to the user.
        if (!isValidObjectId(emailId)) {
          throw new HttpException(
            `Gmail API Error: ${error.message}`,
            statusCode >= 100 && statusCode < 600
              ? statusCode
              : HttpStatus.INTERNAL_SERVER_ERROR,
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
    const gmail = await this.getGmailClient(userId);
    if (gmail) {
      try {
        const subject = data.subject;
        const to = data.to;
        const body = data.body;

        const message = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/html; charset=utf-8',
          '',
          body,
        ].join('\n');

        const encodedMessage = Buffer.from(message)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage,
          },
        });

        return { message: 'Email sent successfully via Gmail' };
      } catch (error) {
        this.logger.warn(`Failed to send Gmail: ${error.message}`);
      }
    }

    try {
      const preview = data.body.substring(0, 100);

      // Save to sender's sent folder
      console.log(`🟢 Saving email to sender's sent folder. From: ${userEmail}, To: ${data.to}`);
      const sentEmail = await this.emailModel.save({
        from: userEmail,
        to: data.to,
        subject: data.subject,
        body: data.body,
        preview,
        isRead: true,
        isStarred: false,
        folder: 'sent',
        sentAt: new Date(),
        accountId: userId,
      });
      console.log(`✅ Saved sent email with ID: ${sentEmail._id}`);

      // Check if recipient exists in our system
      const recipient = await this.accountModel.findOne({ email: data.to });
      if (recipient) {
        // Save to recipient's inbox
        console.log(`🟢 Saving email to recipient's inbox. To: ${data.to}, RecipientID: ${recipient._id}`);
        const inboxEmail = await this.emailModel.save({
          from: userEmail,
          to: data.to,
          subject: data.subject,
          body: data.body,
          preview,
          isRead: false,
          isStarred: false,
          folder: 'inbox',
          sentAt: new Date(),
          accountId: recipient._id as string,
        });
        console.log(`✅ Saved inbox email with ID: ${inboxEmail._id}`);
      } else {
        console.log(`ℹ️ Recipient ${data.to} not found in system`);
      }

      return { message: 'Email sent successfully' };
    } catch (error) {
      console.log(`🔴 Error in sendEmail:`, error);
      this.logger.error(error);
      throw new HttpException(
        'Error sending email',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async replyEmail(
    userId: string,
    userEmail: string,
    emailId: string,
    data: ReplyEmailDto,
  ) {
    const gmail = await this.getGmailClient(userId);
    const originalEmail = await this.getEmailById(userId, emailId);
    if (!originalEmail) {
      throw new HttpException('Original email not found', HttpStatus.NOT_FOUND);
    }

    // Extract email addresses from formatted strings
    const originalFromEmail = this.extractEmailAddress(originalEmail.from);
    const userEmailNormalized = this.extractEmailAddress(userEmail);

    console.log(
      `🔵 Reply email START: originalFrom=${originalFromEmail}, userEmail=${userEmailNormalized}, originalTo=${originalEmail.to}`,
    );
    this.logger.debug(
      `Reply email: originalFrom=${originalFromEmail}, userEmail=${userEmailNormalized}, originalTo=${originalEmail.to}`,
    );

    let recipients: string[];
    if (data.replyAll) {
      // Split by comma and extract email addresses
      const originalToEmails = originalEmail.to
        .split(',')
        .map((email: string) => this.extractEmailAddress(email.trim()))
        .filter((email: string) => email && email.length > 0);
      
      const recipientsSet = new Set<string>();
      
      // Always include the original sender (the person who sent the email we're replying to)
      if (originalFromEmail && originalFromEmail.toLowerCase() !== userEmailNormalized.toLowerCase()) {
        recipientsSet.add(originalFromEmail);
      }

      // Add original recipients, excluding current user
      originalToEmails.forEach((emailAddr: string) => {
        if (emailAddr && emailAddr.toLowerCase() !== userEmailNormalized.toLowerCase()) {
          recipientsSet.add(emailAddr);
        }
      });

      recipients = Array.from(recipientsSet);
    } else {
      // Reply: only original sender
      recipients = originalFromEmail && originalFromEmail.toLowerCase() !== userEmailNormalized.toLowerCase()
        ? [originalFromEmail]
        : [];
    }

    console.log(`🔵 Reply recipients: ${recipients.join(', ')}`);
    this.logger.debug(`Reply recipients: ${recipients.join(', ')}`);

    // Validate that we have at least one recipient
    if (recipients.length === 0) {
      console.log(
        `🔴 No valid recipients found for reply. originalFrom=${originalFromEmail}, userEmail=${userEmailNormalized}`,
      );
      this.logger.error(
        `No valid recipients found for reply. originalFrom=${originalFromEmail}, userEmail=${userEmailNormalized}`,
      );
      throw new HttpException(
        'No valid recipients found for reply',
        HttpStatus.BAD_REQUEST,
      );
    }

    const recipientsString = recipients.join(', ');

    if (gmail) {
      try {
        // For Gmail, we need to construct a reply message
        const subject = originalEmail.subject.startsWith('Re:')
          ? originalEmail.subject
          : `Re: ${originalEmail.subject}`;

        const replyBody = `\n\n--- Original Message ---\nFrom: ${originalEmail.from}\nTo: ${originalEmail.to}\nDate: ${originalEmail.sentAt}\nSubject: ${originalEmail.subject}\n\n${originalEmail.body}\n\n--- Reply ---\n${data.body}`;

        const message = [
          `To: ${recipientsString}`,
          `Subject: ${subject}`,
          `In-Reply-To: ${emailId}`,
          `References: ${emailId}`,
          'Content-Type: text/html; charset=utf-8',
          '',
          replyBody,
        ].join('\n');

        const encodedMessage = Buffer.from(message)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage,
            threadId: emailId, // This might need to be the actual thread ID
          },
        });

        return { message: 'Reply sent successfully via Gmail' };
      } catch (error) {
        this.logger.warn(`Failed to send Gmail reply: ${error.message}`);
      }
    }

    try {
      const preview = data.body.substring(0, 100);
      const subject = originalEmail.subject.startsWith('Re:')
        ? originalEmail.subject
        : `Re: ${originalEmail.subject}`;

      // Save reply to sender's sent folder
      console.log(`🟢 Saving reply to sender's sent folder. From: ${userEmail}, To: ${recipientsString}`);
      const sentEmail = await this.emailModel.save({
        from: userEmail,
        to: recipientsString,
        subject,
        body: data.body,
        preview,
        isRead: true,
        isStarred: false,
        folder: 'sent',
        sentAt: new Date(),
        accountId: userId,
      });
      console.log(`✅ Saved sent email with ID: ${sentEmail._id}`);

      // Save to each recipient's inbox if they exist in our system
      let savedCount = 0;
      for (const recipientEmail of recipients) {
        // Normalize email for lookup (extract if needed)
        const normalizedEmail = this.extractEmailAddress(recipientEmail);
        if (!normalizedEmail) {
          console.log(`⚠️ Could not extract email from: ${recipientEmail}`);
          this.logger.warn(`Could not extract email from: ${recipientEmail}`);
          continue;
        }

        const recipient = await this.accountModel.findOne({
          email: normalizedEmail,
        });
        if (recipient) {
          console.log(`🟢 Saving reply to recipient's inbox. To: ${normalizedEmail}, RecipientID: ${recipient._id}`);
          const inboxEmail = await this.emailModel.save({
            from: userEmail,
            to: normalizedEmail,
            subject,
            body: data.body,
            preview,
            isRead: false,
            isStarred: false,
            folder: 'inbox',
            sentAt: new Date(),
            accountId: recipient._id as string,
          });
          savedCount++;
          console.log(`✅ Saved inbox email with ID: ${inboxEmail._id} for ${normalizedEmail}`);
          this.logger.debug(`Saved reply email to inbox of ${normalizedEmail}`);
        } else {
          // Log warning if recipient not found in system
          console.log(`⚠️ Recipient ${normalizedEmail} not found in system`);
          this.logger.warn(
            `Recipient ${normalizedEmail} not found in system, email not saved to inbox`,
          );
        }
      }

      console.log(`📊 Reply process complete. Saved to ${savedCount} recipients.`);
      if (savedCount === 0) {
        console.log(
          `⚠️ No recipients found in system for reply. Recipients: ${recipients.join(', ')}`,
        );
        this.logger.warn(
          `No recipients found in system for reply. Recipients: ${recipients.join(', ')}`,
        );
      }

      return { message: 'Reply sent successfully' };
    } catch (error) {
      console.log(`🔴 Error in replyEmail:`, error);
      this.logger.error(error);
      throw new HttpException(
        'Error sending reply',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async modifyEmail(userId: string, emailId: string, data: ModifyEmailDto) {
    const gmail = await this.getGmailClient(userId);

    if (gmail) {
      try {
        const { data: emailData } = await gmail.users.messages.get({
          userId: 'me',
          id: emailId,
        });
        const modifyBody: any = {};

        if (data.delete) {
          await gmail.users.messages.trash({ userId: 'me', id: emailId });
          return { message: 'Email moved to trash' };
        }

        if (data.isRead !== undefined) {
          if (data.isRead) {
            modifyBody.removeLabelIds = ['UNREAD'];
          } else {
            modifyBody.addLabelIds = ['UNREAD'];
          }
        }

        if (data.isStarred !== undefined) {
          if (data.isStarred) {
            modifyBody.addLabelIds = [
              ...(modifyBody.addLabelIds || []),
              'STARRED',
            ];
          } else {
            modifyBody.removeLabelIds = [
              ...(modifyBody.removeLabelIds || []),
              'STARRED',
            ];
          }
        }

        if (Object.keys(modifyBody).length > 0) {
          await gmail.users.messages.modify({
            userId: 'me',
            id: emailId,
            requestBody: modifyBody,
          });
        }

        return { message: 'Email modified successfully' };
      } catch (error) {
        this.logger.warn(`Failed to modify Gmail: ${error.message}`);
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

      const update: any = {};

      if (data.delete) {
        if (email.folder === 'trash') {
          await this.emailModel.deleteOne({ _id: emailId });
          return { message: 'Email permanently deleted' };
        } else {
          update.folder = 'trash';
        }
      }

      if (data.isRead !== undefined) {
        update.isRead = data.isRead;
        if (data.isRead && !email.readAt) {
          update.readAt = new Date();
        }
      }

      if (data.isStarred !== undefined) {
        update.isStarred = data.isStarred;
      }

      if (Object.keys(update).length > 0) {
        await this.emailModel.updateOne({ _id: emailId }, update);
      }

      return { message: 'Email modified successfully' };
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error modifying email',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async toggleStar(userId: string, emailId: string) {
    const gmail = await this.getGmailClient(userId);
    if (gmail) {
      try {
        const { data } = await gmail.users.messages.get({
          userId: 'me',
          id: emailId,
        });
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
        return {
          message: 'Email starred status updated',
          isStarred: !isStarred,
        };
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

      return {
        message: 'Email starred status updated',
        isStarred: !email.isStarred,
      };
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
      const existingEmails = await this.emailModel.countDocuments({
        accountId: userId,
      });
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

      // Use save() to create each email
      for (const email of mockEmails) {
        await this.emailModel.save(email);
      }

      return {
        message: `Successfully seeded ${mockEmails.length} mock emails`,
      };
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(
        'Error seeding mock emails',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
