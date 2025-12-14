import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { EmailProvidersModule } from '@email/providers/email-providers.module';
import { EmailModelModule } from '@database/models';

@Module({
  imports: [EmailProvidersModule, EmailModelModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}

