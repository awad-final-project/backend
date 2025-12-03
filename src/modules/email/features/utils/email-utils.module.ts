import { Module } from '@nestjs/common';
import { EmailProvidersModule } from '@email/providers/email-providers.module';
import { EmailUtilsController } from './email-utils.controller';
import { EmailUtilsService } from './email-utils.service';

@Module({
  imports: [EmailProvidersModule],
  controllers: [EmailUtilsController],
  providers: [EmailUtilsService],
  exports: [EmailUtilsService],
})
export class EmailUtilsModule {}
