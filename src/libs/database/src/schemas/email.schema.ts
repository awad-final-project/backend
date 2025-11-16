import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Document, Schema as MongooseSchema } from 'mongoose';

export type EmailDocument = HydratedDocument<Email>;

type IEmail = {
  from: string;
  to: string;
  subject: string;
  body: string;
  preview: string;
  isRead: boolean;
  isStarred: boolean;
  folder: 'inbox' | 'sent' | 'drafts' | 'starred' | 'archive' | 'trash';
  sentAt: Date;
  readAt?: Date;
  accountId: string;
};

@Schema({
  collection: 'emails',
  versionKey: false,
  timestamps: {
    createdAt: true,
    updatedAt: true,
  },
})
export class Email extends Document implements IEmail {
  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  to: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  body: string;

  @Prop({ required: true })
  preview: string;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: false })
  isStarred: boolean;

  @Prop({ required: true, enum: ['inbox', 'sent', 'drafts', 'starred', 'archive', 'trash'] })
  folder: 'inbox' | 'sent' | 'drafts' | 'starred' | 'archive' | 'trash';

  @Prop({ required: true })
  sentAt: Date;

  @Prop()
  readAt?: Date;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Account' })
  accountId: string;
}

export const EmailSchema = SchemaFactory.createForClass(Email);
