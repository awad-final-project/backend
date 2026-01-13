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
import { DraftsModule } from '@email/features/drafts/drafts.module';
import { NotificationsModule } from '@email/features/notifications/notifications.module';
import { SnoozeModule } from '@email/features/snooze/snooze.module';
import { AiModule } from '@email/features/ai/ai.module';
import { KanbanModule } from '@email/features/kanban/kanban.module';
import { SearchModule } from '@email/features/search/search.module';
import { SyncModule } from '@email/features/sync/sync.module';

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
    DraftsModule,
    NotificationsModule,
    SnoozeModule,
    AiModule,
    KanbanModule,
    SearchModule,
    SyncModule,
  ],
  exports: [
    EmailProvidersModule,
    AttachmentModule,
    MailboxModule,
    InboxModule,
    ComposeModule,
    EmailActionsModule,
    EmailUtilsModule,
    DraftsModule,
    NotificationsModule,
    SnoozeModule,
    AiModule,
    KanbanModule,
    SearchModule,
    SyncModule,
  ],
})
export class EmailModule {}
