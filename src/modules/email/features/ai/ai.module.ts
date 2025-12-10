import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { EmailProvidersModule } from '@email/providers/email-providers.module';

@Module({
  imports: [EmailProvidersModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
