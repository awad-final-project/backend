import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { EmailModelModule, AccountModelModule, AccessTokenModelModule } from '@database/models';
import { StorageModule } from '@app/modules/storage';
import { MailModule } from '@app/modules/mailer';
import { ImapModule } from '@app/modules/imap';

import { GmailProviderService } from './gmail/gmail-provider.service';
import { DatabaseProviderService } from './database/database-provider.service';
import { EmailProviderFactory } from './email-provider.factory';

/**
 * Email Providers Module
 * Shared module that provides email provider services and auth dependencies to all feature modules
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    EmailModelModule,
    AccountModelModule,
    AccessTokenModelModule,
    StorageModule,
    MailModule,
    ImapModule,
  ],
  providers: [
    GmailProviderService,
    DatabaseProviderService,
    EmailProviderFactory,
  ],
  exports: [
    // Export modules so feature modules can use them
    PassportModule,
    JwtModule,
    EmailModelModule,
    AccountModelModule,
    AccessTokenModelModule,
    // Export providers
    GmailProviderService,
    DatabaseProviderService,
    EmailProviderFactory,
  ],
})
export class EmailProvidersModule {}
