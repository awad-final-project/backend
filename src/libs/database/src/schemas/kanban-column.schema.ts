import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type KanbanColumnDocument = KanbanColumn & Document;

@Schema({ timestamps: true })
export class KanbanColumn {
  @Prop({ required: true, type: Types.ObjectId })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  id: string; // e.g., "inbox", "todo", "in-progress", "done"

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ required: true, default: 0 })
  position: number; // For ordering columns

  @Prop()
  gmailLabel?: string; // Gmail label mapping (e.g., "INBOX", "TODO", "DONE")

  @Prop({ default: '#3b82f6' })
  color?: string;

  @Prop({ default: false })
  isDefault: boolean; // Default columns (inbox) cannot be deleted

  createdAt?: Date;
  updatedAt?: Date;
}

export const KanbanColumnSchema = SchemaFactory.createForClass(KanbanColumn);

// Indexes
KanbanColumnSchema.index({ accountId: 1, id: 1 }, { unique: true });
KanbanColumnSchema.index({ accountId: 1, position: 1 });
