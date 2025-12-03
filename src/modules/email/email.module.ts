import { Module } from '@nestjs/common';

// Providers Module (shared across features)
import { EmailProvidersModule } from '@email/providers/email-providers.module';

// Feature Modules
import { AttachmentModule } from '@email/features/attachment/attachment.module';
import { MailboxModule } from '@email/features/mailbox/mailbox.module';
import { InboxModule } from '@email/features/inbox/inbox.module';
import { ComposeModule } from '@email/features/compose/compose.module';
import { EmailActionsModule } from '@email/features/actions/email-actions.module';
import { EmailUtilsModule } from '@email/features/utils/email-utils.module';

/**
 * Email Module
 * Aggregates all email-related features into a cohesive module
 * Following Modular Architecture and Feature-based organization
 */
@Module({
  imports: [
    // Shared Providers
    EmailProvidersModule,
    // Feature Modules
    AttachmentModule,
    MailboxModule,
    InboxModule,
    ComposeModule,
    EmailActionsModule,
    EmailUtilsModule,
  ],
  exports: [
    EmailProvidersModule,
    AttachmentModule,
    MailboxModule,
    InboxModule,
    ComposeModule,
    EmailActionsModule,
    EmailUtilsModule,
  ],
})
export class EmailModule {}
