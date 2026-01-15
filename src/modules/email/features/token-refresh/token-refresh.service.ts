import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountModel } from '../../../../libs/database/src/models';
import { google } from 'googleapis';
import { ConfigService } from '@nestjs/config';

/**
 * Background service to automatically refresh Gmail OAuth2 tokens before expiry
 * Runs every 5 minutes to check for tokens that need refreshing
 */
@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(TokenRefreshService.name);

  constructor(
    private readonly accountModel: AccountModel,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Cron job that runs every 5 minutes to refresh expiring tokens
   * Refreshes tokens that expire within the next 10 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshExpiringTokens() {
    try {
      this.logger.debug('🔄 Running Gmail token refresh check...');

      // Find users with Gmail tokens expiring in the next 10 minutes
      const now = new Date();
      const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

      const usersNeedingRefresh = await this.accountModel.find({
        googleRefreshToken: { $exists: true, $ne: null },
        googleTokenExpiry: { $exists: true, $lte: tenMinutesFromNow },
      });

      if (usersNeedingRefresh.length === 0) {
        this.logger.debug('✅ No tokens need refreshing');
        return;
      }

      this.logger.log(`🔄 Found ${usersNeedingRefresh.length} tokens to refresh`);

      for (const user of usersNeedingRefresh) {
        try {
          await this.refreshUserToken(user);
        } catch (error) {
          this.logger.error(
            `❌ Failed to refresh token for user ${user._id}: ${error.message}`,
          );
        }
      }

      this.logger.log('✅ Token refresh cycle completed');
    } catch (error) {
      this.logger.error(`❌ Token refresh job failed: ${error.message}`);
    }
  }

  /**
   * Refresh OAuth2 token for a single user
   */
  private async refreshUserToken(user: any): Promise<void> {
    const userId = user._id.toString();
    const tokenExpiry = user.googleTokenExpiry;
    const minutesLeft = tokenExpiry
      ? Math.floor((tokenExpiry.getTime() - Date.now()) / 60000)
      : 0;

    this.logger.log(
      `🔄 Refreshing token for user ${userId} (expires in ${minutesLeft} minutes)`,
    );

    const oauth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_CALLBACK_URL'),
    );

    oauth2Client.setCredentials({
      refresh_token: user.googleRefreshToken,
    });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (credentials.access_token) {
        user.googleAccessToken = credentials.access_token;

        // Calculate new expiry time (Google tokens typically last 1 hour)
        const expiryTime = new Date();
        if (credentials.expiry_date) {
          expiryTime.setTime(credentials.expiry_date);
        } else {
          // Default to 1 hour if not provided
          expiryTime.setTime(expiryTime.getTime() + 3600 * 1000);
        }
        user.googleTokenExpiry = expiryTime;

        this.logger.log(
          `✅ Token refreshed for user ${userId}, expires at ${expiryTime.toISOString()}`,
        );
      }

      if (credentials.refresh_token) {
        user.googleRefreshToken = credentials.refresh_token;
        this.logger.log(`🔄 Refresh token rotated for user ${userId}`);
      }

      await this.accountModel.save(user);
    } catch (error) {
      this.logger.error(
        `❌ Failed to refresh token for user ${userId}: ${error.message}`,
      );
      // Mark token as invalid if refresh fails
      if (error.message?.includes('invalid_grant')) {
        this.logger.warn(
          `⚠️ Refresh token invalid for user ${userId}, clearing tokens`,
        );
        user.googleAccessToken = null;
        user.googleRefreshToken = null;
        user.googleTokenExpiry = null;
        await this.accountModel.save(user);
      }
      throw error;
    }
  }

  /**
   * Manually refresh a specific user's token (can be called on-demand)
   */
  async refreshTokenForUser(userId: string): Promise<boolean> {
    try {
      const user = await this.accountModel.findOne({ _id: userId });
      if (!user || !user.googleRefreshToken) {
        this.logger.warn(
          `⚠️ User ${userId} has no refresh token to refresh`,
        );
        return false;
      }

      await this.refreshUserToken(user);
      return true;
    } catch (error) {
      this.logger.error(
        `❌ Failed to refresh token for user ${userId}: ${error.message}`,
      );
      return false;
    }
  }
}
