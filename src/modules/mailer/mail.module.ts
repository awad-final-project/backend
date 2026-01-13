import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { MailService } from './mail.service';
import { DynamicMailService } from './dynamic-mail.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const mailSecure = configService.get<string>('MAIL_SECURE');
        // Convert string 'true'/'false' to boolean, default to false for port 587
        const isSecure = mailSecure === 'true';
        
        return {
          transport: {
            host: configService.get<string>('MAIL_HOST') || 'smtp.gmail.com',
            port: parseInt(configService.get<string>('MAIL_PORT') || '587', 10),
            secure: isSecure,
            auth: {
              user: configService.get<string>('MAIL_USER'),
              pass: configService.get<string>('MAIL_PASSWORD'),
            },
          },
          defaults: {
            from: configService.get<string>('MAIL_FROM') || '"No Reply" <noreply@example.com>',
          },
          template: {
            dir: join(__dirname, 'templates'),
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [MailService, DynamicMailService],
  exports: [MailService, DynamicMailService],
})
export class MailModule {}
