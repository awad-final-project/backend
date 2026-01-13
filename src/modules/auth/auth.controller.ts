import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { LogInDto, SignUpDto } from '../../libs/dtos';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../libs/guards/jwt-auth.guard';
import { GoogleAuthGuard } from '../../libs/guards/google-auth.guard';
import { CurrentUser } from '../../libs/decorators';
import { Response } from 'express';

@Controller('')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async signUp(@Body() data: SignUpDto) {
    return this.authService.registerUser(data);
  }

  @Post('login')
  async logIn(
    @Body() data: LogInDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { email, password } = data;
    // Direct validation - không cần LocalStrategy
    const result = await this.authService.loginUser(email, password);
    
    // If using cookie authentication, set httpOnly cookie
    if (process.env.USE_COOKIE_AUTH === 'true') {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }
    
    return result;
  }

  @Get('auth/google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Initiates Google OAuth flow
  }

  @Get('auth/google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    const googleProfile = req.user;
    const result = await this.authService.findOrCreateGoogleUser(googleProfile);
    
    // If using cookie authentication, set httpOnly cookie
    if (process.env.USE_COOKIE_AUTH === 'true') {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // Use Lax for OAuth redirects to ensure cookie is set
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }

    // Redirect to frontend Google callback route with tokens in query params
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const callbackUrl = `${frontendUrl}/google-callback?accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&email=${result.email}&username=${encodeURIComponent(result.username)}`;
    
    res.redirect(callbackUrl);
  }

  @Post('refresh')
  async refresh(
    @Body('refreshToken') refreshToken: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Debug logging
    console.log('🔍 Refresh request:', {
      hasBodyToken: !!refreshToken,
      bodyTokenLength: refreshToken?.length || 0,
      hasCookieToken: !!req.cookies?.refreshToken,
      cookieTokenLength: req.cookies?.refreshToken?.length || 0,
      useCookieAuth: process.env.USE_COOKIE_AUTH,
      body: req.body,
    });
    
    // Support both cookie and body-based refresh tokens
    const token = req.cookies?.refreshToken || refreshToken;
    
    if (!token) {
      console.error('❌ No refresh token found in request');
      throw new Error('Refresh token not provided');
    }
    
    const result = await this.authService.refreshToken(token);
    
    // If using cookies, set the new refresh token in httpOnly cookie
    if (req.cookies?.refreshToken && process.env.USE_COOKIE_AUTH === 'true') {
      res.cookie('refreshToken', result.refreshToken || token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }
    
    return result;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: { userId: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Clear httpOnly cookie if using cookie authentication
    if (process.env.USE_COOKIE_AUTH === 'true') {
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
    }
    
    return this.authService.logout(user.userId);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getUser(
    @CurrentUser() user: { userId: string; email: string; username: string },
  ) {
    return this.authService.getUserInfo(user.userId);
  }

  @Post('password/request-reset')
  async requestPasswordReset(@Body('email') email: string) {
    if (!email) {
      throw new Error('Email is required');
    }
    return this.authService.requestPasswordReset(email);
  }

  @Post('password/reset')
  async resetPassword(
    @Body('token') token: string,
    @Body('newPassword') newPassword: string,
  ) {
    if (!token || !newPassword) {
      throw new Error('Token and new password are required');
    }
    return this.authService.resetPassword(token, newPassword);
  }

  @Post('password/change')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: { userId: string },
    @Body('currentPassword') currentPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    if (!currentPassword || !newPassword) {
      throw new Error('Current password and new password are required');
    }
    return this.authService.changePassword(user.userId, currentPassword, newPassword);
  }
}
