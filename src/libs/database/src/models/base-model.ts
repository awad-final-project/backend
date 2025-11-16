import { Injectable } from '@nestjs/common';
import { Document, FilterQuery, Model, Types, UpdateQuery } from 'mongoose';

@Injectable()
export class BaseModel<T extends Document> {
  constructor(protected model: Model<T>) {}

  save(data: Partial<T>) {
    const newData = new this.model(data);
    return newData.save();
  }

  async findByIdAndUpdate(id: Types.ObjectId, update: UpdateQuery<T>) {
    return this.model.findByIdAndUpdate(id, update, { new: true });
  }

  async findById(id: Types.ObjectId) {
    return this.model.findById(id);
  }

  async find(filter: FilterQuery<T>) {
    return this.model.find(filter);
  }

  async findOne(filter: FilterQuery<T>) {
    return this.model.findOne(filter);
  }

  async findByIdAndDelete(id: Types.ObjectId) {
    return this.model.findByIdAndDelete(id);
  }

  async updateOne(filter: FilterQuery<T>, update: UpdateQuery<T>) {
    return this.model.updateOne(filter, update);
  }

  async updateMany(filter: FilterQuery<T>, update: UpdateQuery<T>) {
    return this.model.updateMany(filter, update);
  }

  async updateWithTransaction(
    session: any,
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
  ) {
    return this.model.updateMany(filter, update, { session });
  }

  async upsert(filter: FilterQuery<T>, update: UpdateQuery<T>) {
    return this.model.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
    });
  }

  async saveMany(data: Partial<T>[]) {
    return this.model.insertMany(data);
  }

  async deleteMany(filter: FilterQuery<T>): Promise<any> {
    return this.model.deleteMany(filter);
  }
}
