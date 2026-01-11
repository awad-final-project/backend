import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailModel } from '@database/models';
import { IEmailDetail } from '@email/common/interfaces';

@Injectable()
export class SnoozeService {
  private readonly logger = new Logger(SnoozeService.name);

  constructor(private readonly emailModel: EmailModel) {}

  /**
   * Check for snoozed emails every minute and unsnooze them if time has passed
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleSnoozedEmails() {
    try {
      const now = new Date();
      
      // Find all emails that are snoozed and should be unsnoozed
      const emailsToUnsnooze = await this.emailModel.find({
        isSnoozed: true,
        snoozeUntil: { $lte: now },
      });

      if (emailsToUnsnooze.length === 0) {
        return;
      }

      this.logger.log(`Found ${emailsToUnsnooze.length} emails to unsnooze`);

      // Update all emails in bulk
      const updatePromises = emailsToUnsnooze.map(email =>
        this.emailModel.updateOne(
          { _id: email._id },
          {
            $set: {
              isSnoozed: false,
              folder: 'inbox',
            },
            $unset: {
              snoozeUntil: '',
            },
          },
        )
      );
      
      await Promise.all(updatePromises);
      const result = { modifiedCount: emailsToUnsnooze.length };

      this.logger.log(`Successfully unsnoozed ${result.modifiedCount} emails`);
    } catch (error) {
      this.logger.error('Error processing snoozed emails:', error);
    }
  }

  /**
   * Snooze an email until a specific date/time
   * Supports both Gmail and local database emails
   * For Gmail: Creates/updates DB record to store snooze state
   */
  async snoozeEmail(
    userId: string,
    emailId: string,
    emailDetail: IEmailDetail,
    snoozeUntil: Date,
  ): Promise<void> {
    const now = new Date();
    
    if (snoozeUntil <= now) {
      throw new Error('Snooze time must be in the future');
    }

    // Try to find existing email in DB (for both local and Gmail emails)
    let email = await this.emailModel.findOne({
      $or: [
        { _id: emailId }, // Local mail: MongoDB ObjectID
        { gmailMessageId: emailId }, // Gmail: Gmail message ID
      ],
      accountId: userId,
    });

    const currentLabels = email?.labels || [];
    const updatedLabels = currentLabels.includes('snoozed') 
      ? currentLabels 
      : [...currentLabels, 'snoozed'];

    if (email) {
      // Update existing email
      await this.emailModel.updateOne(
        { _id: email._id },
        {
          $set: {
            isSnoozed: true,
            snoozeUntil,
            snoozedAt: now,
            folder: 'snoozed',
            labels: updatedLabels,
          },
        },
      );
    } else {
      // Create new record for Gmail email
      await this.emailModel.save({
        gmailMessageId: emailId,
        accountId: userId,
        subject: emailDetail.subject,
        from: emailDetail.from,
        to: emailDetail.to,
        body: emailDetail.body,
        sentAt: emailDetail.sentAt,
        isRead: emailDetail.isRead,
        isStarred: emailDetail.isStarred,
        isSnoozed: true,
        snoozeUntil,
        snoozedAt: now,
        folder: 'snoozed',
        labels: updatedLabels,
      });
    }

    this.logger.log(`Email ${emailId} snoozed until ${snoozeUntil.toISOString()}`);
  }

  /**
   * Manually unsnooze an email
   */
  async unsnoozeEmail(userId: string, emailId: string): Promise<void> {
    // Find email by either MongoDB ID or Gmail message ID
    const email = await this.emailModel.findOne({
      $or: [
        { _id: emailId },
        { gmailMessageId: emailId },
      ],
      accountId: userId,
    });

    if (!email) {
      this.logger.warn(`Email ${emailId} not found for unsnooze`);
      return;
    }

    const currentLabels = email.labels || [];
    const updatedLabels = currentLabels.filter(label => label !== 'snoozed');

    await this.emailModel.updateOne(
      { _id: email._id },
      {
        $set: {
          isSnoozed: false,
          folder: 'inbox',
          labels: updatedLabels,
        },
        $unset: {
          snoozeUntil: '',
        },
      },
    );

    this.logger.log(`Email ${emailId} manually unsnoozed`);
  }

  /**
   * Get all snoozed emails for a user
   */
  async getSnoozedEmails(accountId: string) {
    const emails = await this.emailModel.find({
      accountId,
      isSnoozed: true,
    });
    
    // Sort by snoozeUntil date
    return emails.sort((a, b) => {
      const dateA = a.snoozeUntil ? new Date(a.snoozeUntil).getTime() : 0;
      const dateB = b.snoozeUntil ? new Date(b.snoozeUntil).getTime() : 0;
      return dateA - dateB;
    });
  }
}
