import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, UpdateQuery } from 'mongoose';
import { Email, EmailDocument } from '../schemas/email.schema';

@Injectable()
export class EmailModel {
  constructor(@InjectModel(Email.name) private model: Model<EmailDocument>) {}

  async save(data: any): Promise<EmailDocument> {
    const newEmail = new this.model(data);
    return await newEmail.save();
  }

  async findOne(filter: any): Promise<EmailDocument | null> {
    return await this.model.findOne(filter).exec();
  }

  async find(filter: any): Promise<EmailDocument[]> {
    return await this.model.find(filter).exec();
  }

  async findById(id: string): Promise<EmailDocument | null> {
    return await this.model.findById(id).exec();
  }

  async updateOne(
    filter: FilterQuery<EmailDocument>,
    update: UpdateQuery<EmailDocument>,
    options: Record<string, any> = {},
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateOne(filter, update, options).exec();
    return { modifiedCount: result.modifiedCount || 0 };
  }

  async deleteOne(filter: any): Promise<void> {
    await this.model.deleteOne(filter).exec();
  }

  async deleteMany(filter: any): Promise<void> {
    await this.model.deleteMany(filter).exec();
  }

  async countDocuments(filter: any): Promise<number> {
    return await this.model.countDocuments(filter).exec();
  }

  async findMessageIds(filter: FilterQuery<EmailDocument>): Promise<string[]> {
    const records = await this.model
      .find(filter)
      .select('messageId')
      .lean()
      .exec();

    return records
      .map((record: any) => record.messageId || record._id?.toString())
      .filter((id: string | undefined): id is string => Boolean(id));
  }
}
