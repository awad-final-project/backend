import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Attachment, AttachmentSchema } from '../../schemas/attachment.schema';
import { AttachmentModel } from './attachment.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Attachment.name, schema: AttachmentSchema },
    ]),
  ],
  providers: [AttachmentModel],
  exports: [AttachmentModel],
})
export class AttachmentModelModule {}
