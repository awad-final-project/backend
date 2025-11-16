import { Module } from '@nestjs/common';
import { AccountModel } from './account.model';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountSchema, Account } from '../../schemas';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Account.name, schema: AccountSchema }]),
  ],
  providers: [AccountModel],
  exports: [AccountModel],
})
export class AccountModelModule {}
