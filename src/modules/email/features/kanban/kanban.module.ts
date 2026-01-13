import { Module } from '@nestjs/common';
import { KanbanModelModule } from '@database/models';
import { EmailProvidersModule } from '@email/providers/email-providers.module';
import { KanbanController } from './kanban.controller';
import { KanbanService } from './kanban.service';

@Module({
  imports: [
    KanbanModelModule,
    EmailProvidersModule,
  ],
  controllers: [KanbanController],
  providers: [KanbanService],
  exports: [KanbanService],
})
export class KanbanModule {}
