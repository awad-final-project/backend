import { Module } from '@nestjs/common';
import { EmailActionsController } from './email-actions.controller';
import { EmailActionsService } from './email-actions.service';

@Module({
  controllers: [EmailActionsController],
  providers: [EmailActionsService],
  exports: [EmailActionsService],
})
export class EmailActionsModule {}
