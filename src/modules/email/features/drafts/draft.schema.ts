import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DraftDocument = Draft & Document;

@Schema({ collection: 'drafts' })
export class Draft {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  to: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  body: string;

  @Prop()
  cc?: string;

  @Prop()
  bcc?: string;

  @Prop()
  replyTo?: string;

  @Prop({ required: true })
  createdAt: Date;

  @Prop({ required: true })
  updatedAt: Date;
}

export const DraftSchema = SchemaFactory.createForClass(Draft);

// Index for efficient querying
DraftSchema.index({ userId: 1, updatedAt: -1 });
