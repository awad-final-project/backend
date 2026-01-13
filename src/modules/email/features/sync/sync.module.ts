import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { EmailProvidersModule } from '@email/providers/email-providers.module';
import { EmailModelModule } from '@database/models';

@Module({
  imports: [EmailProvidersModule, EmailModelModule],
  providers: [SyncService],
  controllers: [SyncController],
  exports: [SyncService],
})
export class SyncModule {}
