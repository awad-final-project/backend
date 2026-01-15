import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { InfoModule } from '../info/info.module';
import { DatabaseModule } from '../../libs/database/src/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), 
    ScheduleModule.forRoot(), // Enable cron jobs for token refresh
    DatabaseModule,
    AuthModule, 
    EmailModule,
    InfoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
