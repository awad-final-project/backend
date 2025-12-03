import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ImapService } from './imap.service';
import { StorageModule } from '../storage';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    StorageModule,
  ],
  providers: [ImapService],
  exports: [ImapService],
})
export class ImapModule {}
