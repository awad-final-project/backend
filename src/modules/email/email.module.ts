import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { EmailModelModule, AccountModelModule, AccessTokenModelModule } from '../../libs/database/src/models';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    EmailModelModule,
    AccountModelModule,
    AccessTokenModelModule,
  ],
  controllers: [EmailController],
  providers: [EmailService],
})
export class EmailModule {}
