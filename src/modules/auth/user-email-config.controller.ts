import { Controller, Post, Get, Delete, Body, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { AuthService } from './auth.service';
import { SaveEmailConfigDto, EmailConfigResponseDto } from './dto/email-config.dto';
import { AccountModel } from '@database/models';
import { DynamicMailService } from '../mailer/dynamic-mail.service';
import { ImapProviderService } from '../email/providers/imap/imap-provider.service';

@ApiTags('User Email Configuration')
@ApiBearerAuth()
@Controller('user/email-config')
@UseGuards(JwtAuthGuard)
export class UserEmailConfigController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountModel: AccountModel,
    private readonly dynamicMailService: DynamicMailService,
    private readonly imapProvider: ImapProviderService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Configure IMAP/SMTP email account' })
  @ApiResponse({ status: 201, description: 'Email configuration saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid credentials or configuration' })
  async saveEmailConfig(
    @CurrentUser() user: { userId: string },
    @Body() config: SaveEmailConfigDto,
  ): Promise<EmailConfigResponseDto> {
    try {
      // Verify credentials before saving
      const isValid = await this.dynamicMailService.verifyCredentials(
        config.email,
        config.password,
        config.provider,
      );

      if (!isValid) {
        throw new HttpException(
          'Failed to verify email credentials. Please check your email and password.',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Encrypt password before storing
      const encryptedPassword = await this.authService.encryptCredentials(config.password, user.userId);

      // Update user account with IMAP credentials
      await this.accountModel.updateOne(
        { _id: user.userId },
        {
          imapEmail: config.email,
          imapPassword: encryptedPassword,
          emailProvider: config.provider,
          emailConfigUpdatedAt: new Date(),
        },
      );

      // Clear IMAP provider cache to force re-verification next time
      this.imapProvider.clearCache(user.userId);

      return {
        email: config.email,
        provider: config.provider,
        isConfigured: true,
        lastVerified: new Date(),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          message: 'Failed to save email configuration',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get current email configuration' })
  @ApiResponse({ status: 200, description: 'Returns email configuration' })
  async getEmailConfig(
    @CurrentUser() user: { userId: string },
  ): Promise<EmailConfigResponseDto | null> {
    const account = await this.accountModel.findOne({ _id: user.userId });

    if (!account?.imapEmail) {
      return null;
    }

    return {
      email: account.imapEmail,
      provider: (account as any).emailProvider || 'other',
      isConfigured: true,
      lastVerified: (account as any).emailConfigUpdatedAt,
    };
  }

  @Delete()
  @ApiOperation({ summary: 'Remove email configuration' })
  @ApiResponse({ status: 200, description: 'Email configuration removed' })
  async removeEmailConfig(
    @CurrentUser() user: { userId: string },
  ): Promise<{ message: string }> {
    await this.accountModel.updateOne(
      { _id: user.userId },
      {
        $unset: {
          imapEmail: '',
          imapPassword: '',
          emailProvider: '',
          emailConfigUpdatedAt: '',
        },
      },
    );

    // Clear IMAP provider cache
    this.imapProvider.clearCache(user.userId);

    return { message: 'Email configuration removed successfully' };
  }
}
