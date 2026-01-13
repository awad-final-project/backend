import { BaseModel } from '../base-model';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PasswordReset } from '../../schemas';
import { Model } from 'mongoose';

@Injectable()
export class PasswordResetModel extends BaseModel<PasswordReset> {
  constructor(@InjectModel(PasswordReset.name) model: Model<PasswordReset>) {
    super(model);
  }
}
