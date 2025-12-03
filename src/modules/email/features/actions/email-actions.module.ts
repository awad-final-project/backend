import { Module } from '@nestjs/common';
import { EmailProvidersModule } from '@email/providers/email-providers.module';
import { EmailActionsController } from './email-actions.controller';
import { EmailActionsService } from './email-actions.service';

@Module({
  imports: [EmailProvidersModule],
  controllers: [EmailActionsController],
  providers: [EmailActionsService],
  exports: [EmailActionsService],
})
export class EmailActionsModule {}
