import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KanbanColumn, KanbanColumnSchema } from '../schemas/kanban-column.schema';
import { KanbanCard, KanbanCardSchema } from '../schemas/kanban-card.schema';
import { KanbanColumnModel } from './kanban-column/kanban-column.model';
import { KanbanCardModel } from './kanban-card/kanban-card.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KanbanColumn.name, schema: KanbanColumnSchema },
      { name: KanbanCard.name, schema: KanbanCardSchema },
    ]),
  ],
  providers: [KanbanColumnModel, KanbanCardModel],
  exports: [KanbanColumnModel, KanbanCardModel],
})
export class KanbanModelModule {}
