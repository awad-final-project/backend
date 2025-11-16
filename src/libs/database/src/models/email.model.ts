import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  async updateOne(filter: any, update: any): Promise<void> {
    await this.model.updateOne(filter, update).exec();
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
}
