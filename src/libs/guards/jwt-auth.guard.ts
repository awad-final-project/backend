import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenModel } from '../database/src/models';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  constructor(
    private readonly jwtService: JwtService,
    private readonly accessTokenModel: AccessTokenModel,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    const token = authHeader?.split(' ')[1]; // Bearer <token>

    if (!token) {
      this.logger.warn(`No token provided for ${request.method} ${request.url}`);
      throw new UnauthorizedException('Token not found');
    }

    try {
      const decoded = await this.jwtService.verifyAsync(token);
      const accessToken = await this.accessTokenModel.findOne({
        accessToken: token,
      });

      if (!accessToken) {
        this.logger.warn(`Token not found in database for user: ${decoded.userId}`);
        throw new UnauthorizedException('Invalid token'); // Check if token exists in the database
      }

      request.user = decoded; // Attach user info to request
      return true;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      this.logger.error(`Token verification failed: ${_error.message}`);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
