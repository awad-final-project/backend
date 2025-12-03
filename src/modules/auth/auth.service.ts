import { AccessTokenModel, AccountModel, RefreshTokenModel } from '../../libs/database/src/models';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { SignUpDto } from '../../libs/dtos';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;

  constructor(
    private readonly accountModel: AccountModel,
    private readonly accessTokenModel: AccessTokenModel,
    private readonly refreshTokenModel: RefreshTokenModel,
    private readonly jwtService: JwtService,
  ) {}

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

  async registerUser(data: SignUpDto) {
    try {
      const user = await this.accountModel.findOne({ email: data.email });
      if (user) {
        throw new HttpException(
          'The email is already in use',
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
      await this.accountModel.save({
        username: data.username,
        email: data.email,
        password: hashedPassword,
        role: 'user',
      });
      return { message: 'User registered successfully' };
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
          picture: userInfo.picture,
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
    picture?: string;
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
          user.picture = googleProfile.picture;
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
            picture: googleProfile.picture,
          });
        }
      } else {
        // Update tokens and picture for existing user
        user.googleAccessToken = googleProfile.accessToken;
        user.picture = googleProfile.picture;
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
}
