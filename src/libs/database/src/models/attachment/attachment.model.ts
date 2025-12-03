import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attachment, AttachmentDocument } from '../../schemas/attachment.schema';
import { BaseModel } from '../base-model';

@Injectable()
export class AttachmentModel extends BaseModel<AttachmentDocument> {
  constructor(
    @InjectModel(Attachment.name)
    private attachmentModel: Model<AttachmentDocument>,
  ) {
    super(attachmentModel);
  }

  async findByEmailId(emailId: string): Promise<AttachmentDocument[]> {
    return this.attachmentModel.find({ emailId }).exec();
  }

  async deleteByEmailId(emailId: string): Promise<void> {
    await this.attachmentModel.deleteMany({ emailId }).exec();
  }

  async findByS3Key(s3Key: string): Promise<AttachmentDocument | null> {
    return this.attachmentModel.findOne({ s3Key }).exec();
  }

  async findByIdString(id: string): Promise<AttachmentDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.attachmentModel.findById(new Types.ObjectId(id)).exec();
  }

  async deleteByIdString(id: string): Promise<void> {
    if (Types.ObjectId.isValid(id)) {
      await this.attachmentModel.findByIdAndDelete(new Types.ObjectId(id)).exec();
    }
  }
}
