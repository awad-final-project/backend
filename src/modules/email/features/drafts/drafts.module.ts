import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DraftsController } from './drafts.controller';
import { DraftsService } from './drafts.service';
import { Draft, DraftSchema } from './draft.schema';
import { EmailProvidersModule } from '@email/providers/email-providers.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Draft.name, schema: DraftSchema }]),
    EmailProvidersModule,
  ],
  controllers: [DraftsController],
  providers: [DraftsService],
  exports: [DraftsService],
})
export class DraftsModule {}
