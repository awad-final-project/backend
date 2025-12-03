import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { google } from 'googleapis';
import { ConfigService } from '@nestjs/config';
import { AccountModel } from '@app/libs/database/src/models';

export interface WatchResponse {
  historyId: string;
  expiration: string;
}

/**
 * Gmail Push Notifications Service
 * Handles Gmail Pub/Sub watch setup and notification processing
 */
@Injectable()
export class GmailPushService {
  private readonly logger = new Logger(GmailPushService.name);

  constructor(
    private configService: ConfigService,
    private accountModel: AccountModel,
  ) {}

  async setupWatch(userId: string): Promise<WatchResponse> {
    try {
      const user = await this.accountModel.findOne({ _id: userId });
      if (!user?.googleRefreshToken) {
        throw new HttpException(
          {
            message: 'User not found or Google account not connected',
            error: 'Google refresh token is required for push notifications',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const oauth2Client = new google.auth.OAuth2(
        this.configService.get('GOOGLE_CLIENT_ID'),
        this.configService.get('GOOGLE_CLIENT_SECRET'),
        this.configService.get('GOOGLE_CALLBACK_URL'),
      );

      oauth2Client.setCredentials({
        refresh_token: user.googleRefreshToken,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Set up push notification watch
      const response = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          labelIds: ['INBOX'],
          topicName: this.configService.get('GMAIL_PUBSUB_TOPIC'),
        },
      });

      const watchData = {
        historyId: response.data.historyId!,
        expiration: new Date(parseInt(response.data.expiration!)).toISOString(),
      };

      // Store watch data in user document
      user.gmailWatch = {
        historyId: watchData.historyId,
        expiration: watchData.expiration,
      };
      await this.accountModel.save(user);

      this.logger.log(`Gmail watch setup for user ${userId}: ${watchData.historyId}`);
      return watchData;
    } catch (error) {
      this.logger.error(`Failed to setup Gmail watch for user ${userId}:`, error);
      throw new HttpException(
        {
          message: 'Failed to setup push notifications',
          error: error.message || 'Unknown error occurred',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async stopWatch(userId: string): Promise<void> {
    try {
      const user = await this.accountModel.findOne({ _id: userId });
      if (!user?.googleRefreshToken) {
        throw new HttpException(
          'User not found or Google account not connected',
          HttpStatus.BAD_REQUEST,
        );
      }

      const oauth2Client = new google.auth.OAuth2(
        this.configService.get('GOOGLE_CLIENT_ID'),
        this.configService.get('GOOGLE_CLIENT_SECRET'),
        this.configService.get('GOOGLE_CALLBACK_URL'),
      );

      oauth2Client.setCredentials({
        refresh_token: user.googleRefreshToken,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      await gmail.users.stop({
        userId: 'me',
      });

      // Clear watch data from user document
      user.gmailWatch = undefined;
      await this.accountModel.save(user);

      this.logger.log(`Gmail watch stopped for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to stop Gmail watch for user ${userId}:`, error);
      throw new HttpException(
        {
          message: 'Failed to stop push notifications',
          error: error.message || 'Unknown error occurred',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async processNotification(notification: any): Promise<void> {
    try {
      // Decode the Pub/Sub message
      const decodedData = Buffer.from(notification.message.data, 'base64').toString();
      const data = JSON.parse(decodedData);

      this.logger.log(`Received Gmail notification: ${JSON.stringify(data)}`);

      const emailAddress = data.emailAddress;
      const historyId = data.historyId;

      // Find user by email
      const user = await this.accountModel.findOne({ email: emailAddress });
      if (!user) {
        this.logger.warn(`User not found for email: ${emailAddress}`);
        return;
      }

      // Here you would typically:
      // 1. Fetch the history changes using the historyId
      // 2. Process new emails/changes
      // 3. Emit real-time events to connected clients (WebSocket/SSE)
      // 4. Update the user's historyId

      this.logger.log(`Processed notification for user ${user._id}, historyId: ${historyId}`);
    } catch (error) {
      this.logger.error('Failed to process Gmail notification:', error);
      // Don't throw - we don't want to fail the Pub/Sub acknowledgment
    }
  }

  async renewWatch(userId: string): Promise<void> {
    try {
      const user = await this.accountModel.findOne({ _id: userId });
      if (!user?.gmailWatch?.expiration) {
        return;
      }

      const expirationDate = new Date(user.gmailWatch.expiration);
      const now = new Date();
      const hoursUntilExpiry = (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Renew if less than 24 hours until expiry
      if (hoursUntilExpiry < 24) {
        await this.setupWatch(userId);
        this.logger.log(`Renewed Gmail watch for user ${userId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to renew Gmail watch for user ${userId}:`, error);
    }
  }
}
