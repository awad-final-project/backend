import { Module } from '@nestjs/common';
import { EmailProvidersModule } from '@email/providers/email-providers.module';
import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';
import { AttachmentModelModule } from '@database/models';
import { StorageModule } from '@app/modules/storage';

@Module({
  imports: [
    EmailProvidersModule, // Provides JwtModule, PassportModule, AccessTokenModel for JwtAuthGuard
    AttachmentModelModule,
    StorageModule,
  ],
  controllers: [AttachmentController],
  providers: [AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
