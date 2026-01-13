import { Injectable, Logger } from '@nestjs/common';
import { EmailModel } from '@database/models';
import { EmailProviderFactory } from '@email/providers/email-provider.factory';
import { generatePreview } from '@email/common/utils/email.utils';

/**
 * Email Sync Service
 * Syncs emails from external providers (Gmail, IMAP) to local database
 * This enables search and AI features to work with all email sources
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private syncInProgress = new Map<string, boolean>();

  constructor(
    private readonly emailModel: EmailModel,
    private readonly providerFactory: EmailProviderFactory,
  ) {}

  /**
   * Sync a single email from provider to database
   * Used when viewing email details to ensure it's cached
   */
  async syncSingleEmail(
    userId: string,
    emailId: string,
    emailDetail: any,
  ): Promise<void> {
    try {
      // Check if email already exists in DB
      const existing = await this.emailModel.findOne({
        $or: [
          { _id: emailId },
          { gmailMessageId: emailId },
          { imapMessageId: emailId },
        ],
        accountId: userId,
      });

      if (existing) {
        // Update if content is missing
        if (!existing.body || existing.body.length < 100) {
          await this.emailModel.updateOne(
            { _id: existing._id },
            {
              body: emailDetail.body,
              preview: emailDetail.preview || generatePreview(emailDetail.body),
              subject: emailDetail.subject,
              from: emailDetail.from,
              to: emailDetail.to,
              cc: emailDetail.cc,
              bcc: emailDetail.bcc,
              sentAt: emailDetail.sentAt,
              isRead: emailDetail.isRead,
              isStarred: emailDetail.isStarred,
              folder: emailDetail.folder,
              attachments: emailDetail.attachments,
              updatedAt: new Date(),
            },
          );
          this.logger.log(`Updated cached email ${emailId} for user ${userId}`);
        }
        return;
      }

      // Create new cached email
      await this.emailModel.save({
        gmailMessageId: emailId.includes('@') ? null : emailId,
        imapMessageId: null, // Set by IMAP provider if applicable
        accountId: userId,
        subject: emailDetail.subject,
        from: emailDetail.from,
        to: emailDetail.to,
        cc: emailDetail.cc,
        bcc: emailDetail.bcc,
        body: emailDetail.body,
        preview: emailDetail.preview || generatePreview(emailDetail.body),
        sentAt: emailDetail.sentAt,
        readAt: emailDetail.readAt,
        folder: emailDetail.folder || 'inbox',
        isRead: emailDetail.isRead,
        isStarred: emailDetail.isStarred,
        attachments: emailDetail.attachments,
        labels: emailDetail.labels || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.logger.log(`Cached new email ${emailId} for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to sync email ${emailId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Sync emails from a folder
   * Useful for bulk syncing inbox, sent, etc.
   */
  async syncFolder(
    userId: string,
    folder: string = 'inbox',
    limit: number = 50,
  ): Promise<{
    synced: number;
    skipped: number;
    failed: number;
  }> {
    // Prevent concurrent syncs for same user
    const syncKey = `${userId}:${folder}`;
    if (this.syncInProgress.get(syncKey)) {
      this.logger.warn(`Sync already in progress for ${syncKey}`);
      return { synced: 0, skipped: 0, failed: 0 };
    }

    this.syncInProgress.set(syncKey, true);

    try {
      const provider = await this.providerFactory.getProvider(userId);
      const result = await provider.getEmailsByFolder(userId, folder, 1, limit);

      let synced = 0;
      let skipped = 0;
      let failed = 0;

      for (const email of result.emails) {
        try {
          // Check if already synced
          const existing = await this.emailModel.findOne({
            $or: [
              { _id: email.id },
              { gmailMessageId: email.id },
              { imapMessageId: email.id },
            ],
            accountId: userId,
          });

          if (existing && existing.body) {
            skipped++;
            continue;
          }

          // Get full email details
          const emailDetail = await provider.getEmailById(userId, email.id);
          if (emailDetail) {
            await this.syncSingleEmail(userId, email.id, emailDetail);
            synced++;
          } else {
            failed++;
          }
        } catch (error) {
          this.logger.error(
            `Failed to sync email ${email.id}: ${error.message}`,
          );
          failed++;
        }
      }

      this.logger.log(
        `Folder sync completed for ${syncKey}: synced=${synced}, skipped=${skipped}, failed=${failed}`,
      );

      return { synced, skipped, failed };
    } catch (error) {
      this.logger.error(`Folder sync failed for ${syncKey}: ${error.message}`);
      throw error;
    } finally {
      this.syncInProgress.delete(syncKey);
    }
  }

  /**
   * Background sync - sync all folders for a user
   * Can be called periodically via cron
   */
  async syncAllFolders(userId: string): Promise<void> {
    const folders = ['inbox', 'sent', 'drafts'];

    for (const folder of folders) {
      try {
        await this.syncFolder(userId, folder, 50);
      } catch (error) {
        this.logger.error(
          `Failed to sync folder ${folder} for user ${userId}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Get sync status for a user
   */
  isSyncInProgress(userId: string, folder?: string): boolean {
    if (folder) {
      return this.syncInProgress.get(`${userId}:${folder}`) || false;
    }
    // Check if any sync is in progress for this user
    for (const key of this.syncInProgress.keys()) {
      if (key.startsWith(`${userId}:`)) {
        return true;
      }
    }
    return false;
  }
}
