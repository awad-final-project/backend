import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PasswordReset, PasswordResetSchema } from '../../schemas';
import { PasswordResetModel } from './password-reset.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PasswordReset.name, schema: PasswordResetSchema },
    ]),
  ],
  providers: [PasswordResetModel],
  exports: [PasswordResetModel],
})
export class PasswordResetModule {}
