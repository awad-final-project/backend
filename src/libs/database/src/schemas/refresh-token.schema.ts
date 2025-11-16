import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Document } from 'mongoose';

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

@Schema({
  collection: 'refresh_tokens',
  versionKey: false,
  timestamps: {
    createdAt: true,
    updatedAt: true,
  },
})
export class RefreshToken extends Document {
  @Prop({ required: true })
  token: string;

  @Prop({ required: true })
  accountId: string;

  @Prop({ required: true })
  expiresAt: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
