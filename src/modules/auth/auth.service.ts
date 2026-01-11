import { AccessTokenModel, AccountModel, RefreshTokenModel, PasswordResetModel } from '../../libs/database/src/models';
import { HttpException, HttpStatus, Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SignUpDto } from '../../libs/dtos';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { promisify } from 'util';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mailer';

const scryptAsync = promisify(scrypt);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 16;
  private readonly SALT_LENGTH = 64;
  private readonly TAG_LENGTH = 16;
  private readonly KEY_LENGTH = 32;

  constructor(
    private readonly accountModel: AccountModel,
    private readonly accessTokenModel: AccessTokenModel,
    private readonly refreshTokenModel: RefreshTokenModel,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => MailService))
    private readonly mailService: MailService,
    private readonly passwordResetModel: PasswordResetModel,
  ) {}

  /**
   * Check if email service is configured
   */
  private isEmailConfigured(): boolean {
    const mailHost = this.configService.get<string>('MAIL_HOST');
    const mailUser = this.configService.get<string>('MAIL_USER');
    const mailPassword = this.configService.get<string>('MAIL_PASSWORD');
    return !!(mailHost && mailUser && mailPassword);
  }

  private async generateAccessToken(userId: string, email: string, username: string, role: string) {
    const payload = { userId, email, username, role };
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  private generateRefreshToken(): string {
    return randomBytes(40).toString('hex');
  }

  private async hashPassword(password: string) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }

  private async validatePassword(password: string, hashedPassword: string) {
    return await bcrypt.compare(password, hashedPassword);
  }

  /**
   * Validate user credentials (for Local Strategy)
   */
  async validateUser(email: string, password: string) {
    try {
      const user = await this.accountModel.findOne({ email });
      if (!user || !user.password) {
        return null;
      }

      const isPasswordValid = await this.validatePassword(password, user.password);
      if (!isPasswordValid) {
        return null;
      }

      return {
        userId: user._id,
        email: user.email,
        username: user.username,
        role: user.role || 'user',
      };
    } catch (error) {
      this.logger.error(`Error validating user: ${error.message}`);
      return null;
    }
  }

  /**
   * Encrypt email credentials (for SMTP/IMAP)
   */
  async encryptCredentials(data: string, userPassword: string): Promise<string> {
    try {
      const salt = randomBytes(this.SALT_LENGTH);
      const key = (await scryptAsync(userPassword, salt, this.KEY_LENGTH)) as Buffer;
      const iv = randomBytes(this.IV_LENGTH);
      
      const cipher = createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv);
      
      const encrypted = Buffer.concat([
        cipher.update(data, 'utf8'),
        cipher.final(),
      ]);
      
      const tag = cipher.getAuthTag();
      
      // Combine salt + iv + tag + encrypted data
      const result = Buffer.concat([salt, iv, tag, encrypted]);
      return result.toString('base64');
    } catch (error) {
      this.logger.error(`Error encrypting credentials: ${error.message}`);
      throw new HttpException('Error encrypting credentials', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Decrypt email credentials (for SMTP/IMAP)
   */
  async decryptCredentials(encryptedData: string, userPassword: string): Promise<string> {
    try {
      const buffer = Buffer.from(encryptedData, 'base64');
      
      const salt = buffer.subarray(0, this.SALT_LENGTH);
      const iv = buffer.subarray(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
      const tag = buffer.subarray(
        this.SALT_LENGTH + this.IV_LENGTH,
        this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH,
      );
      const encrypted = buffer.subarray(this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH);
      
      const key = (await scryptAsync(userPassword, salt, this.KEY_LENGTH)) as Buffer;
      
      const decipher = createDecipheriv(this.ENCRYPTION_ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.error(`Error decrypting credentials: ${error.message}`);
      throw new HttpException('Error decrypting credentials', HttpStatus.UNAUTHORIZED);
    }
  }

  async registerUser(data: SignUpDto) {
    try {
      // Auto-generate email from username with @hkt.com domain
      const email = `${data.username.toLowerCase()}@hkt.com`;
      
      const existingUser = await this.accountModel.findOne({ email });
      if (existingUser) {
        throw new HttpException(
          'Username already exists',
          HttpStatus.BAD_REQUEST,
        );
      }
      const username = await this.accountModel.findOne({
        username: data.username,
      });
      if (username) {
        throw new HttpException(
          'Username already exists',
          HttpStatus.BAD_REQUEST,
        );
      }
      const hashedPassword = await this.hashPassword(data.password);
      const newUser = await this.accountModel.save({
        username: data.username,
        email: email,
        password: hashedPassword,
        role: 'user',
        authProvider: 'local',
      });

      // Send welcome email (only if email is configured)
      if (this.isEmailConfigured()) {
        try {
          await this.mailService.sendWelcomeEmail(email, data.username);
          this.logger.log(`Welcome email sent to ${email}`);
        } catch (emailError) {
          this.logger.error(`Failed to send welcome email: ${emailError.message}`);
          // Don't fail registration if email fails
        }
      } else {
        this.logger.warn('Email service not configured - skipping welcome email');
      }

      return { 
        message: 'User registered successfully',
        userId: newUser._id,
        email: newUser.email,
        username: newUser.username,
      };
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error registering user',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async loginUser(email: string, password: string) {
    try {
      const user = await this.accountModel.findOne({ email });
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      if (!(await this.validatePassword(password, user.password))) {
        throw new HttpException(
          'Invalid email or password',
          HttpStatus.BAD_REQUEST,
        );
      }

      const accessToken = await this.generateAccessToken(
        user._id as string,
        user.email,
        user.username,
        user.role || 'user',
      );

      const refreshToken = this.generateRefreshToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS);

      await this.refreshTokenModel.save({
        token: refreshToken,
        accountId: user._id as string,
        expiresAt,
      });

      await this.accessTokenModel.save({
        accessToken: accessToken,
        accountId: user._id as string,
      });

      return {
        accessToken,
        refreshToken,
        email: user.email,
        username: user.username,
      };
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error logging in user',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async refreshToken(refreshToken: string, rotateToken: boolean = false) {
    try {
      const tokenDoc = await this.refreshTokenModel.findOne({
        token: refreshToken,
      });

      if (!tokenDoc) {
        throw new HttpException('Invalid refresh token', HttpStatus.UNAUTHORIZED);
      }

      if (new Date() > tokenDoc.expiresAt) {
        await this.refreshTokenModel.deleteMany({ _id: tokenDoc._id });
        throw new HttpException('Refresh token expired', HttpStatus.UNAUTHORIZED);
      }

      const user = await this.accountModel.findOne({ _id: tokenDoc.accountId });
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      const newAccessToken = await this.generateAccessToken(
        user._id as string,
        user.email,
        user.username,
        user.role || 'user',
      );

      await this.accessTokenModel.save({
        accessToken: newAccessToken,
        accountId: user._id as string,
      });

      // Optionally rotate refresh token for better security
      if (rotateToken) {
        const newRefreshToken = this.generateRefreshToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS);

        // Delete old refresh token
        await this.refreshTokenModel.deleteMany({ _id: tokenDoc._id });

        // Save new refresh token
        await this.refreshTokenModel.save({
          token: newRefreshToken,
          accountId: user._id as string,
          expiresAt,
        });

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
      }

      return { accessToken: newAccessToken };
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error refreshing token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async logout(userId: string) {
    try {
      await this.refreshTokenModel.deleteMany({ accountId: userId });
      await this.accessTokenModel.deleteMany({ accountId: userId });
      return { message: 'Logged out successfully' };
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(
        'Error logging out',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getUserInfo(userId: string) {
    try {
      const userInfo = await this.accountModel.findOne({ _id: userId });
      if (userInfo) {
        return {
          username: userInfo.username,
          email: userInfo.email,
          role: userInfo.role || 'user',
        };
      } else {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error getting user info',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOrCreateGoogleUser(googleProfile: {
    googleId: string;
    email: string;
    firstName: string;
    lastName: string;
    picture: string;
    accessToken: string;
    refreshToken?: string;
  }) {
    try {
      // Check if user exists with googleId
      let user = await this.accountModel.findOne({ googleId: googleProfile.googleId });

      if (!user) {
        // Check if user exists with email (local account)
        user = await this.accountModel.findOne({ email: googleProfile.email });

        if (user) {
          // Link Google account to existing local account
          user.googleId = googleProfile.googleId;
          user.authProvider = 'google';
          user.googleAccessToken = googleProfile.accessToken;
          if (googleProfile.refreshToken) {
            user.googleRefreshToken = googleProfile.refreshToken;
          }
          await this.accountModel.save(user);
        } else {
          // Create new Google user
          const username = `${googleProfile.firstName.toLowerCase()}_${googleProfile.lastName.toLowerCase()}_${Date.now()}`;
          user = await this.accountModel.save({
            username,
            email: googleProfile.email,
            googleId: googleProfile.googleId,
            authProvider: 'google',
            role: 'user',
            googleAccessToken: googleProfile.accessToken,
            googleRefreshToken: googleProfile.refreshToken,
          });
        }
      } else {
        // Update tokens for existing user
        user.googleAccessToken = googleProfile.accessToken;
        if (googleProfile.refreshToken) {
          user.googleRefreshToken = googleProfile.refreshToken;
        }
        await this.accountModel.save(user);
      }

      // Generate tokens

      // Generate tokens
      const accessToken = await this.generateAccessToken(
        user._id as string,
        user.email,
        user.username,
        user.role || 'user',
      );

      const refreshToken = this.generateRefreshToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS);

      await this.refreshTokenModel.save({
        token: refreshToken,
        accountId: user._id as string,
        expiresAt,
      });

      await this.accessTokenModel.save({
        accessToken: accessToken,
        accountId: user._id as string,
      });

      return {
        accessToken,
        refreshToken,
        email: user.email,
        username: user.username,
      };
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error with Google authentication',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    try {
      // Check if email service is configured
      if (!this.isEmailConfigured()) {
        throw new HttpException(
          'Email service is not configured. Please contact administrator.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const user = await this.accountModel.findOne({ email });
      if (!user) {
        // Don't reveal if user exists for security
        return { message: 'If the email exists, a reset link will be sent' };
      }

      // Generate secure reset token
      const resetToken = randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

      // Save reset token
      await this.passwordResetModel.save({
        email,
        token: resetToken,
        expiresAt,
        used: false,
      });

      // Send password reset email
      try {
        await this.mailService.sendPasswordResetEmail(email, resetToken);
        this.logger.log(`Password reset email sent to ${email}`);
      } catch (emailError) {
        this.logger.error(`Failed to send password reset email: ${emailError.message}`);
        throw new HttpException(
          'Failed to send reset email',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return { message: 'If the email exists, a reset link will be sent' };
    } catch (error) {
      this.logger.error(`Error requesting password reset: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error processing password reset request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    try {
      // Find valid reset token
      const resetRecord = await this.passwordResetModel.findOne({
        token,
        used: false,
      });

      if (!resetRecord) {
        throw new HttpException('Invalid or expired reset token', HttpStatus.BAD_REQUEST);
      }

      if (new Date() > resetRecord.expiresAt) {
        throw new HttpException('Reset token has expired', HttpStatus.BAD_REQUEST);
      }

      // Find user and update password
      const user = await this.accountModel.findOne({ email: resetRecord.email });
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Hash new password
      const hashedPassword = await this.hashPassword(newPassword);
      user.password = hashedPassword;
      await this.accountModel.save(user);

      // Mark token as used
      resetRecord.used = true;
      await this.passwordResetModel.save(resetRecord);

      // Invalidate all existing sessions for security
      await this.refreshTokenModel.deleteMany({ accountId: user._id });
      await this.accessTokenModel.deleteMany({ accountId: user._id });

      this.logger.log(`Password reset successful for user: ${user.email}`);

      return { message: 'Password reset successfully' };
    } catch (error) {
      this.logger.error(`Error resetting password: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error resetting password',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Change password (for authenticated users)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    try {
      const user = await this.accountModel.findOne({ _id: userId });
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      if (!user.password) {
        throw new HttpException(
          'Cannot change password for OAuth users',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Verify current password
      const isValid = await this.validatePassword(currentPassword, user.password);
      if (!isValid) {
        throw new HttpException('Current password is incorrect', HttpStatus.BAD_REQUEST);
      }

      // Hash and save new password
      const hashedPassword = await this.hashPassword(newPassword);
      user.password = hashedPassword;
      await this.accountModel.save(user);

      // Invalidate all existing sessions
      await this.refreshTokenModel.deleteMany({ accountId: userId });
      await this.accessTokenModel.deleteMany({ accountId: userId });

      this.logger.log(`Password changed for user: ${user.email}`);

      return { message: 'Password changed successfully' };
    } catch (error) {
      this.logger.error(`Error changing password: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error changing password',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
