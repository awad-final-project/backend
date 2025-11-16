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
  async logIn(@Body() data: LogInDto) {
    const { email, password } = data;
    return this.authService.loginUser(email, password);
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
    
    // Redirect to frontend Google callback route with tokens in query params
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const callbackUrl = `${frontendUrl}/log-in/google-callback?accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&email=${result.email}&username=${encodeURIComponent(result.username)}`;
    
    res.redirect(callbackUrl);
  }

  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: { userId: string }) {
    return this.authService.logout(user.userId);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getUser(
    @CurrentUser() user: { userId: string; email: string; username: string },
  ) {
    return this.authService.getUserInfo(user.userId);
  }
}
