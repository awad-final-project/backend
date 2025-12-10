import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailModel } from '@database/models';

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
   */
  async snoozeEmail(emailId: string, snoozeUntil: Date): Promise<void> {
    const now = new Date();
    
    if (snoozeUntil <= now) {
      throw new Error('Snooze time must be in the future');
    }

    await this.emailModel.updateOne(
      { _id: emailId },
      {
        $set: {
          isSnoozed: true,
          snoozeUntil,
          snoozedAt: now,
          folder: 'archive', // Move to archive while snoozed
        },
      },
    );

    this.logger.log(`Email ${emailId} snoozed until ${snoozeUntil.toISOString()}`);
  }

  /**
   * Manually unsnooze an email
   */
  async unsnoozeEmail(emailId: string): Promise<void> {
    await this.emailModel.updateOne(
      { _id: emailId },
      {
        $set: {
          isSnoozed: false,
          folder: 'inbox',
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
