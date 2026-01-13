import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SnoozeController } from './snooze.controller';
import { SnoozeService } from './snooze.service';
import { EmailProvidersModule } from '@email/providers/email-providers.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EmailProvidersModule,
  ],
  controllers: [SnoozeController],
  providers: [SnoozeService],
  exports: [SnoozeService],
})
export class SnoozeModule {}
