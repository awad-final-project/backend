import { Module } from '@nestjs/common';
import { TokenRefreshService } from './token-refresh.service';
import { DatabaseModule } from '@database/database.module';

/**
 * Module for automatic Gmail OAuth2 token refresh
 * Runs background jobs to refresh tokens before expiry
 */
@Module({
  imports: [DatabaseModule],
  providers: [TokenRefreshService],
  exports: [TokenRefreshService],
})
export class TokenRefreshModule {}
