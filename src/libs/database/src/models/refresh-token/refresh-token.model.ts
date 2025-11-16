import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseModel } from '../base-model';
import { RefreshToken, RefreshTokenDocument } from '../../schemas';

@Injectable()
export class RefreshTokenModel extends BaseModel<RefreshTokenDocument> {
  constructor(
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {
    super(refreshTokenModel);
  }
}
