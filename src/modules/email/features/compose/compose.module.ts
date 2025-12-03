import { Module } from '@nestjs/common';
import { EmailProvidersModule } from '@email/providers/email-providers.module';
import { AttachmentModule } from '@email/features/attachment/attachment.module';
import { ComposeController } from './compose.controller';
import { ComposeService } from './compose.service';

@Module({
  imports: [EmailProvidersModule, AttachmentModule],
  controllers: [ComposeController],
  providers: [ComposeService],
  exports: [ComposeService],
})
export class ComposeModule {}
