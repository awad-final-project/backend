import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Email, EmailSchema } from '../schemas/email.schema';
import { EmailModel } from './email.model';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Email.name, schema: EmailSchema }]),
  ],
  providers: [EmailModel],
  exports: [EmailModel],
})
export class EmailModelModule {}
