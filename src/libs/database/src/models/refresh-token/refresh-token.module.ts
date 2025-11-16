import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RefreshToken, RefreshTokenSchema } from '../../schemas';
import { RefreshTokenModel } from './refresh-token.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  providers: [RefreshTokenModel],
  exports: [RefreshTokenModel],
})
export class RefreshTokenModule {}
