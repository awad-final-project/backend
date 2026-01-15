import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  /**
   * Mask sensitive data in request body
   */
  private maskSensitiveData(data: any, visited = new WeakSet()): any {
    if (!data || typeof data !== 'object') return data;

    // Prevent circular reference infinite loop
    if (visited.has(data)) return '[Circular Reference]';
    visited.add(data);

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.maskSensitiveData(item, visited));
    }

    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'apiKey',
      'accessToken',
      'refreshToken',
      'authorization',
    ];

    const masked: any = {};
    for (const key of Object.keys(data)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
        masked[key] = '***MASKED***';
      } else if (typeof data[key] === 'object' && data[key] !== null) {
        masked[key] = this.maskSensitiveData(data[key], visited);
      } else {
        masked[key] = data[key];
      }
    }

    return masked;
  }

  /**
   * Get client IP address
   */
  private getClientIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string) ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, url, body, query, params, headers } = request;
    const userAgent = headers['user-agent'] || 'unknown';
    const clientIp = this.getClientIp(request);

    // Generate request ID for tracking
    const requestId =
      (headers['x-request-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add request ID to response headers
    response.setHeader('X-Request-ID', requestId);

    const startTime = Date.now();

    // Log incoming request
    this.logger.log(`Incoming ${method} ${url}`, {
      requestId,
      clientIp,
      userAgent,
      query: Object.keys(query).length > 0 ? query : undefined,
      params: Object.keys(params).length > 0 ? params : undefined,
      body: Object.keys(body).length > 0 ? this.maskSensitiveData(body) : undefined,
      headers: {
        'content-type': headers['content-type'],
        'accept': headers['accept'],
        'origin': headers['origin'],
        'referer': headers['referer'],
      },
    });

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        // Log successful response
        this.logger.log(`${method} ${url} ${statusCode} - ${duration}ms`, {
          requestId,
          method,
          url,
          statusCode,
          duration: `${duration}ms`,
          responseSize: JSON.stringify(data).length,
        });

        // Log response body for debugging (only in development)
        if (process.env.NODE_ENV !== 'production' && data) {
          this.logger.debug('Response Body', {
            requestId,
            data: this.maskSensitiveData(data),
          });
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;

        // Log error response
        this.logger.error(`${method} ${url} FAILED - ${duration}ms`, error.stack, {
          requestId,
          duration: `${duration}ms`,
          error: {
            name: error.name,
            message: error.message,
            status: error.status || 500,
            response: error.response,
          },
        });

        throw error;
      }),
    );
  }
}
