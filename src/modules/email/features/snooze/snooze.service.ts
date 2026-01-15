import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailModel } from '@database/models';
import { IEmailDetail } from '@email/common/interfaces';
import { isValidObjectId } from 'mongoose';
import { EmailProviderFactory } from '@email/providers/email-provider.factory';
import { GmailProviderService } from '@email/providers/gmail/gmail-provider.service';

@Injectable()
export class SnoozeService {
  private readonly logger = new Logger(SnoozeService.name);

  constructor(
    private readonly emailModel: EmailModel,
    private readonly providerFactory: EmailProviderFactory,
  ) {}

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
      const updatePromises = emailsToUnsnooze.map(async (email) => {
        // Sync with Gmail if it's a Gmail email
        if (email.gmailMessageId) {
          await this.syncGmailUnsnooze(
            email.accountId.toString(),
            email.gmailMessageId,
          );
        }

        return this.emailModel.updateOne(
          { _id: email._id },
          {
            $set: {
              isSnoozed: false,
              folder: 'inbox',
              labels: (email.labels || []).filter((l) => l !== 'snoozed'),
            },
            $unset: {
              snoozeUntil: '',
            },
          },
        );
      });

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
    const snoozeOrConditions: any[] = [
      { gmailMessageId: emailId }, // Gmail: Gmail message ID
    ];

    if (isValidObjectId(emailId)) {
      snoozeOrConditions.unshift({ _id: emailId }); // Local mail: MongoDB ObjectID
    }

    const email = await this.emailModel.findOne({
      $or: snoozeOrConditions,
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
            folder: 'archive', // Hide from inbox, use archive instead of 'snoozed'
            labels: updatedLabels,
          },
        },
      );
    } else {
      // Create new record for Gmail email
      const preview =
        emailDetail.preview ||
        (emailDetail.body ? emailDetail.body.substring(0, 150) : '');
      await this.emailModel.save({
        gmailMessageId: emailId,
        accountId: userId,
        subject: emailDetail.subject,
        from: emailDetail.from,
        to: emailDetail.to,
        body: emailDetail.body,
        preview, // Required field - generate from body if not available
        sentAt: emailDetail.sentAt,
        isRead: emailDetail.isRead,
        isStarred: emailDetail.isStarred,
        isSnoozed: true,
        snoozeUntil,
        snoozedAt: now,
        folder: 'archive', // Hide from inbox
        labels: updatedLabels,
      });
    }

    // Sync with Gmail if it's a Gmail email
    if (emailId && !isValidObjectId(emailId)) {
      // Gmail message ID (not MongoDB ObjectID)
      await this.syncGmailSnooze(userId, emailId);
    } else if (email?.gmailMessageId) {
      // MongoDB email with Gmail message ID
      await this.syncGmailSnooze(userId, email.gmailMessageId);
    }

    this.logger.log(
      `Email ${emailId} snoozed until ${snoozeUntil.toISOString()}`,
    );
  }

  /**
   * Sync snooze action with Gmail
   * - Add custom label "snoozed"
   * - Remove INBOX label (hide from inbox)
   */
  private async syncGmailSnooze(
    userId: string,
    gmailMessageId: string,
  ): Promise<void> {
    try {
      const provider = await this.providerFactory.getProvider(userId);

      if (!(provider instanceof GmailProviderService)) {
        return; // Not a Gmail account
      }

      const gmailProvider = provider as any;

      // Add "snoozed" label (will create if not exists)
      if (gmailProvider.addLabel) {
        await gmailProvider.addLabel(userId, gmailMessageId, 'snoozed');
        this.logger.debug(`[Gmail] Added snoozed label to ${gmailMessageId}`);
      }

      // Remove INBOX label
      if (gmailProvider.removeLabel) {
        await gmailProvider.removeLabel(userId, gmailMessageId, 'INBOX');
        this.logger.debug(`[Gmail] Removed INBOX label from ${gmailMessageId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to sync snooze with Gmail: ${error.message}`);
      // Don't throw - allow snooze to succeed even if Gmail sync fails
    }
  }

  /**
   * Sync unsnooze action with Gmail
   * - Remove custom label "snoozed"
   * - Add INBOX label (return to inbox)
   */
  private async syncGmailUnsnooze(
    userId: string,
    gmailMessageId: string,
  ): Promise<void> {
    try {
      const provider = await this.providerFactory.getProvider(userId);

      if (!(provider instanceof GmailProviderService)) {
        return; // Not a Gmail account
      }

      const gmailProvider = provider as any;

      // Remove "snoozed" label
      if (gmailProvider.removeLabel) {
        await gmailProvider.removeLabel(userId, gmailMessageId, 'snoozed');
        this.logger.debug(
          `[Gmail] Removed snoozed label from ${gmailMessageId}`,
        );
      }

      // Add INBOX label
      if (gmailProvider.addLabel) {
        await gmailProvider.addLabel(userId, gmailMessageId, 'INBOX');
        this.logger.debug(`[Gmail] Added INBOX label to ${gmailMessageId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to sync unsnooze with Gmail: ${error.message}`);
      // Don't throw - allow unsnooze to succeed even if Gmail sync fails
    }
  }

  /**
   * Manually unsnooze an email
   */
  async unsnoozeEmail(userId: string, emailId: string): Promise<void> {
    // Find email by either MongoDB ID or Gmail message ID
    const email = await this.emailModel.findOne({
      $or: [{ _id: emailId }, { gmailMessageId: emailId }],
      accountId: userId,
    });

    if (!email) {
      this.logger.warn(`Email ${emailId} not found for unsnooze`);
      return;
    }

    const currentLabels = email.labels || [];
    const updatedLabels = currentLabels.filter((label) => label !== 'snoozed');

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

    // Sync with Gmail if it's a Gmail email
    if (email.gmailMessageId) {
      await this.syncGmailUnsnooze(userId, email.gmailMessageId);
    }

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
