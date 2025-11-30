import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { AttachmentService } from './attachment.service';
import { EmailModelModule, AccountModelModule, AccessTokenModelModule, AttachmentModelModule } from '../../libs/database/src/models';
import { StorageModule } from '../storage';
import { MailModule } from '../mailer';
import { ImapModule } from '../imap';

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
    AttachmentModelModule,
    StorageModule,
    MailModule,
    ImapModule,
  ],
  controllers: [EmailController],
  providers: [EmailService, AttachmentService],
  exports: [EmailService, AttachmentService],
})
export class EmailModule {}
