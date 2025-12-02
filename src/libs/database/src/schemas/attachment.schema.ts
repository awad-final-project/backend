import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Document, Schema as MongooseSchema } from 'mongoose';

export type AttachmentDocument = HydratedDocument<Attachment>;

type IAttachment = {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  s3Key: string;
  s3Bucket: string;
  emailId?: string;
  uploadedAt: Date;
};

@Schema({
  collection: 'attachments',
  versionKey: false,
  timestamps: {
    createdAt: true,
    updatedAt: true,
  },
})
export class Attachment extends Document implements IAttachment {
  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  size: number;

  @Prop({ required: true })
  s3Key: string;

  @Prop({ required: true })
  s3Bucket: string;

  // emailId is optional - can be null/undefined when attachment is first uploaded
  // Will be linked to email after email is sent
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Email', required: false })
  emailId?: string;

  @Prop({ required: true, default: () => new Date() })
  uploadedAt: Date;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);
