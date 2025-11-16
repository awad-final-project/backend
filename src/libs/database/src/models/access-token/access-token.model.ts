import { BaseModel } from '../base-model';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AccessToken } from '../../schemas';
import { Model } from 'mongoose';

@Injectable()
export class AccessTokenModel extends BaseModel<AccessToken> {
  constructor(@InjectModel(AccessToken.name) model: Model<AccessToken>) {
    super(model);
  }
}
