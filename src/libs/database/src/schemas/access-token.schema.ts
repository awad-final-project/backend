import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Document } from 'mongoose';

export type AccessTokenDocument = HydratedDocument<AccessToken>;

type IAccessToken = {
  accountId: string;
  accessToken: string;
};

@Schema({
  collection: 'access-tokens',
  versionKey: false,
  timestamps: {
    createdAt: true,
    updatedAt: true,
  },
})
export class AccessToken extends Document implements IAccessToken {
  @Prop({ type: String, ref: 'Account', required: true })
  accountId: string;

  @Prop({ required: true })
  accessToken: string;
}

export const AccessTokenSchema = SchemaFactory.createForClass(AccessToken);
