import { Module } from '@nestjs/common';
import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';
import { AttachmentModelModule } from '../../../../libs/database/src/models';
import { StorageModule } from '../../../storage';

@Module({
  imports: [AttachmentModelModule, StorageModule],
  controllers: [AttachmentController],
  providers: [AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
