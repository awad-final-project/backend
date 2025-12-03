import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { EmailModelModule, AccountModelModule } from '../../libs/database/src/models';
import { StorageModule } from '../storage';
import { MailModule } from '../mailer';
import { ImapModule } from '../imap';

// Feature Modules
import { AttachmentModule } from './features/attachment/attachment.module';
import { MailboxModule } from './features/mailbox/mailbox.module';
import { InboxModule } from './features/inbox/inbox.module';
import { ComposeModule } from './features/compose/compose.module';
import { EmailActionsModule } from './features/actions/email-actions.module';
import { EmailUtilsModule } from './features/utils/email-utils.module';

// Providers
import { GmailProviderService } from './providers/gmail/gmail-provider.service';
import { DatabaseProviderService } from './providers/database/database-provider.service';
import { EmailProviderFactory } from './providers/email-provider.factory';

/**
 * Email Module
 * Aggregates all email-related features into a cohesive module
 * Following Modular Architecture and Feature-based organization
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
    // Database Models
    EmailModelModule,
    AccountModelModule,
    StorageModule,
    MailModule,
    ImapModule,
    // Feature Modules
    AttachmentModule,
    MailboxModule,
    InboxModule,
    ComposeModule,
    EmailActionsModule,
    EmailUtilsModule,
  ],
  providers: [
    GmailProviderService,
    DatabaseProviderService,
    EmailProviderFactory,
  ],
  exports: [
    AttachmentModule,
    MailboxModule,
    InboxModule,
    ComposeModule,
    EmailActionsModule,
    EmailUtilsModule,
    EmailProviderFactory,
  ],
})
export class EmailModule {}
