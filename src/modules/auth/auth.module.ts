import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { UserEmailConfigController } from './user-email-config.controller';
import { AuthService } from './auth.service';
import { DatabaseModule } from '../../libs/database/src/database.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import {
  AccessTokenModelModule,
  AccountModelModule,
  RefreshTokenModule,
  PasswordResetModule,
} from '../../libs/database/src/models';
import { GoogleStrategy } from './strategies/google.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { MailModule } from '../mailer';
import { EmailProvidersModule } from '../email/providers/email-providers.module';

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
    AccountModelModule,
    AccessTokenModelModule,
    RefreshTokenModule,
    PasswordResetModule,
    DatabaseModule,
    MailModule,
    EmailProvidersModule,
  ],
  controllers: [AuthController, UserEmailConfigController],
  providers: [AuthService, GoogleStrategy, LocalStrategy],
  exports: [AuthService],
})
export class AuthModule {}
