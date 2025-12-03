import { Module } from '@nestjs/common';
import { EmailUtilsController } from './email-utils.controller';
import { EmailUtilsService } from './email-utils.service';
import { EmailModelModule } from '@database/models';

@Module({
  imports: [EmailModelModule],
  controllers: [EmailUtilsController],
  providers: [EmailUtilsService],
  exports: [EmailUtilsService],
})
export class EmailUtilsModule {}
