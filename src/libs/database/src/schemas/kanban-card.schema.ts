import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type KanbanCardDocument = KanbanCard & Document;

@Schema({ timestamps: true })
export class KanbanCard {
  @Prop({ required: true, type: Types.ObjectId })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  emailId: string; // Reference to email ID (can be ObjectId or Gmail message ID)

  @Prop({ required: true })
  columnId: string; // Current column

  @Prop({ required: true, default: 0 })
  position: number; // Position within column

  @Prop()
  emailProvider?: string; // 'gmail', 'database', 'imap'

  createdAt?: Date;
  updatedAt?: Date;
}

export const KanbanCardSchema = SchemaFactory.createForClass(KanbanCard);

// Indexes
KanbanCardSchema.index({ accountId: 1, emailId: 1 }, { unique: true });
KanbanCardSchema.index({ accountId: 1, columnId: 1, position: 1 });
