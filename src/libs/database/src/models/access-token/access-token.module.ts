import { Module } from '@nestjs/common';
import { AccessTokenModel } from './access-token.model';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessTokenSchema, AccessToken } from '../../schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AccessToken.name, schema: AccessTokenSchema },
    ]),
  ],
  providers: [AccessTokenModel],
  exports: [AccessTokenModel],
})
export class AccessTokenModelModule {}
