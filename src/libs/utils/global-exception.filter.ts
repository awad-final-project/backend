import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MongoError } from 'mongodb';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
  details?: any;
  requestId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers['x-request-id'] as string) || 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorName = 'InternalServerError';
    let details: any = undefined;
    let stack: string | undefined = undefined;

    // Handle different types of exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        details = exceptionResponse;
      }

      errorName = exception.name;
      stack = exception.stack;
    } else if (exception instanceof MongoError) {
      // Handle MongoDB errors
      status = HttpStatus.BAD_REQUEST;
      errorName = 'DatabaseError';

      if (exception.code === 11000) {
        message = 'Duplicate key error';
        details = {
          code: exception.code,
          keyPattern: (exception as any).keyPattern,
          keyValue: (exception as any).keyValue,
        };
      } else {
        message = exception.message;
        details = {
          code: exception.code,
          codeName: (exception as any).codeName,
        };
      }

      stack = exception.stack;
    } else if (exception instanceof Error) {
      // Handle generic errors
      message = exception.message;
      errorName = exception.name;
      stack = exception.stack;

      // Special handling for cast errors (like invalid ObjectId)
      if (exception.name === 'CastError') {
        status = HttpStatus.BAD_REQUEST;
        errorName = 'ValidationError';
        message = `Invalid format for field: ${(exception as any).path}`;
        details = {
          path: (exception as any).path,
          value: (exception as any).value,
          kind: (exception as any).kind,
          reason: (exception as any).reason?.message,
        };
      }
    } else {
      message = 'An unexpected error occurred';
      details = { exception: String(exception) };
    }

    // Build error response
    const errorResponse: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error: errorName,
      requestId,
    };

    // Add details only in non-production or for specific errors
    if (process.env.NODE_ENV !== 'production' || status < 500) {
      if (details) {
        errorResponse.details = details;
      }
    }

    // Log the exception with full context
    const logContext = {
      requestId,
      method: request.method,
      url: request.url,
      statusCode: status,
      errorName,
      message,
      clientIp:
        (request.headers['x-forwarded-for'] as string) ||
        request.socket.remoteAddress,
      userAgent: request.headers['user-agent'],
      body: request.body,
      query: request.query,
      params: request.params,
      user: (request as any).user?.sub || (request as any).user?.id,
    };

    // Log with appropriate level
    if (status >= 500) {
      this.logger.error(
        `${status} ${errorName}: ${message}`,
        stack,
        logContext,
      );
    } else if (status >= 400) {
      this.logger.warn(
        `${status} ${errorName}: ${message}`,
        logContext,
      );
    } else {
      this.logger.log(
        `${status} ${errorName}: ${message}`,
        logContext,
      );
    }

    // Send response
    response.status(status).json(errorResponse);
  }
}
