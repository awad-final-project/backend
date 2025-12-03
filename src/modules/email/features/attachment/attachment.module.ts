import { Module } from '@nestjs/common';
import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';
import { AttachmentModelModule } from '@database/models';
import { StorageModule } from '@app/modules/storage';

@Module({
  imports: [AttachmentModelModule, StorageModule],
  controllers: [AttachmentController],
  providers: [AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
