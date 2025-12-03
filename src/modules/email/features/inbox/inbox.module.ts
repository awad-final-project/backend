import { Module } from '@nestjs/common';
import { EmailProvidersModule } from '@email/providers/email-providers.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  imports: [EmailProvidersModule],
  controllers: [InboxController],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
