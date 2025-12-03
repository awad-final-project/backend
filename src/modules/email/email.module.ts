import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { EmailModelModule, AccountModelModule } from '@database/models';
import { StorageModule } from '@app/modules/storage';
import { MailModule } from '@app/modules/mailer';
import { ImapModule } from '@app/modules/imap';

// Feature Modules
import { AttachmentModule } from '@email/features/attachment/attachment.module';
import { MailboxModule } from '@email/features/mailbox/mailbox.module';
import { InboxModule } from '@email/features/inbox/inbox.module';
import { ComposeModule } from '@email/features/compose/compose.module';
import { EmailActionsModule } from '@email/features/actions/email-actions.module';
import { EmailUtilsModule } from '@email/features/utils/email-utils.module';

// Providers
import { GmailProviderService } from '@email/providers/gmail/gmail-provider.service';
import { DatabaseProviderService } from '@email/providers/database/database-provider.service';
import { EmailProviderFactory } from '@email/providers/email-provider.factory';

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
