import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Document } from 'mongoose';

export type PasswordResetDocument = HydratedDocument<PasswordReset>;

@Schema({
  collection: 'password_resets',
  versionKey: false,
  timestamps: {
    createdAt: true,
    updatedAt: false,
  },
})
export class PasswordReset extends Document {
  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  token: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  used: boolean;
}

export const PasswordResetSchema = SchemaFactory.createForClass(PasswordReset);

// Create index for automatic document deletion
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
