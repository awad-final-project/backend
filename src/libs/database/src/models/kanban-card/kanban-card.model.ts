import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { KanbanCard, KanbanCardDocument } from '../../schemas/kanban-card.schema';

@Injectable()
export class KanbanCardModel {
  constructor(
    @InjectModel(KanbanCard.name)
    private readonly model: Model<KanbanCardDocument>,
  ) {}

  async save(data: Partial<KanbanCard>): Promise<KanbanCardDocument> {
    const doc = new this.model(data);
    return doc.save();
  }

  async findByAccountId(accountId: string): Promise<KanbanCardDocument[]> {
    return this.model
      .find({ accountId: new Types.ObjectId(accountId) })
      .sort({ columnId: 1, position: 1 })
      .exec();
  }

  async findByAccountAndColumn(
    accountId: string,
    columnId: string,
  ): Promise<KanbanCardDocument[]> {
    return this.model
      .find({
        accountId: new Types.ObjectId(accountId),
        columnId,
      })
      .sort({ position: 1 })
      .exec();
  }

  async findByAccountAndEmail(
    accountId: string,
    emailId: string,
  ): Promise<KanbanCardDocument | null> {
    return this.model
      .findOne({
        accountId: new Types.ObjectId(accountId),
        emailId,
      })
      .exec();
  }

  async moveCard(
    accountId: string,
    emailId: string,
    newColumnId: string,
    newPosition: number,
  ): Promise<KanbanCardDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          accountId: new Types.ObjectId(accountId),
          emailId,
        },
        {
          $set: {
            columnId: newColumnId,
            position: newPosition,
          },
        },
        { new: true },
      )
      .exec();
  }

  async updatePositions(
    accountId: string,
    columnId: string,
    updates: Array<{ emailId: string; position: number }>,
  ): Promise<void> {
    const bulkOps = updates.map((update) => ({
      updateOne: {
        filter: {
          accountId: new Types.ObjectId(accountId),
          emailId: update.emailId,
          columnId,
        },
        update: { $set: { position: update.position } },
      },
    }));

    if (bulkOps.length > 0) {
      await this.model.bulkWrite(bulkOps);
    }
  }

  async deleteCard(accountId: string, emailId: string): Promise<boolean> {
    const result = await this.model
      .deleteOne({
        accountId: new Types.ObjectId(accountId),
        emailId,
      })
      .exec();
    return result.deletedCount > 0;
  }

  async deleteByColumn(accountId: string, columnId: string): Promise<void> {
    await this.model
      .deleteMany({
        accountId: new Types.ObjectId(accountId),
        columnId,
      })
      .exec();
  }

  async deleteByAccountId(accountId: string): Promise<void> {
    await this.model
      .deleteMany({ accountId: new Types.ObjectId(accountId) })
      .exec();
  }
}
