import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { KanbanColumn, KanbanColumnDocument } from '../../schemas/kanban-column.schema';

@Injectable()
export class KanbanColumnModel {
  constructor(
    @InjectModel(KanbanColumn.name)
    private readonly model: Model<KanbanColumnDocument>,
  ) {}

  async save(data: Partial<KanbanColumn>): Promise<KanbanColumnDocument> {
    const doc = new this.model(data);
    return doc.save();
  }

  async findByAccountId(accountId: string): Promise<KanbanColumnDocument[]> {
    return this.model
      .find({ accountId: new Types.ObjectId(accountId) })
      .sort({ position: 1 })
      .exec();
  }

  async findByAccountAndColumnId(
    accountId: string,
    columnId: string,
  ): Promise<KanbanColumnDocument | null> {
    return this.model
      .findOne({
        accountId: new Types.ObjectId(accountId),
        id: columnId,
      })
      .exec();
  }

  async updateColumn(
    accountId: string,
    columnId: string,
    updates: Partial<KanbanColumn>,
  ): Promise<KanbanColumnDocument | null> {
    return this.model
      .findOneAndUpdate(
        { accountId: new Types.ObjectId(accountId), id: columnId },
        { $set: updates },
        { new: true },
      )
      .exec();
  }

  async deleteColumn(accountId: string, columnId: string): Promise<boolean> {
    const result = await this.model
      .deleteOne({
        accountId: new Types.ObjectId(accountId),
        id: columnId,
        isDefault: false, // Cannot delete default columns
      })
      .exec();
    return result.deletedCount > 0;
  }

  async deleteByAccountId(accountId: string): Promise<void> {
    await this.model
      .deleteMany({ accountId: new Types.ObjectId(accountId) })
      .exec();
  }

  async countByAccountId(accountId: string): Promise<number> {
    return this.model
      .countDocuments({ accountId: new Types.ObjectId(accountId) })
      .exec();
  }
}
