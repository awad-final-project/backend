import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Document } from 'mongoose';

export type AccountDocument = HydratedDocument<Account>;

type IAccount = {
  username: string;
  email: string;
  password?: string;
  googleId?: string;
  authProvider?: 'local' | 'google';
  role?: string;
};

@Schema({
  collection: 'accounts',
  versionKey: false,
  timestamps: {
    createdAt: true,
    updatedAt: true,
  },
})
export class Account extends Document implements IAccount {
  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  password?: string;

  @Prop({ unique: true, sparse: true })
  googleId?: string;

  @Prop({ default: 'local' })
  authProvider: 'local' | 'google';

  @Prop({ default: 'user' })
  role: string;
}

export const AccountSchema = SchemaFactory.createForClass(Account);
