import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { EmailProvidersModule } from '@email/providers/email-providers.module';
import { EmailModelModule } from '@database/models';
import { SyncModule } from '@email/features/sync/sync.module';

@Module({
  imports: [EmailProvidersModule, EmailModelModule, SyncModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}

