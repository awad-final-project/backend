import { LoggerService, LogLevel } from '@nestjs/common';
import { inspect } from 'util';

interface LogContext {
  timestamp: string;
  level: string;
  context?: string;
  traceId?: string;
  message: string;
  data?: any;
  stack?: string;
  error?: any;
}

export class CustomLogger implements LoggerService {
  private sensitiveKeys = [
    'password',
    'token',
    'secret',
    'apiKey',
    'accessToken',
    'refreshToken',
    'googleAccessToken',
    'googleRefreshToken',
    'authorization',
    'cookie',
    'jwt',
  ];

  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  /**
   * Mask sensitive data in objects/strings
   */
  private maskSensitiveData(data: any): any {
    if (!data) return data;

    if (typeof data === 'string') {
      // Mask JWT tokens in strings
      return data.replace(
        /Bearer\s+[\w-]*\.[\w-]*\.[\w-]*/gi,
        'Bearer ***MASKED***',
      );
    }

    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.maskSensitiveData(item));
    }

    const masked = { ...data };
    for (const key of Object.keys(masked)) {
      const lowerKey = key.toLowerCase();
      if (this.sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
        masked[key] = '***MASKED***';
      } else if (typeof masked[key] === 'object') {
        masked[key] = this.maskSensitiveData(masked[key]);
      }
    }

    return masked;
  }

  /**
   * Format log context with all information
   */
  private formatLog(
    level: string,
    message: any,
    context?: string,
    data?: any,
    stack?: string,
  ): LogContext {
    const logContext: LogContext = {
      timestamp: new Date().toISOString(),
      level,
      context: context || this.context || 'Application',
      message: typeof message === 'object' ? inspect(message) : String(message),
    };

    // Add trace ID if available (from async context)
    const traceId = this.getTraceId();
    if (traceId) {
      logContext.traceId = traceId;
    }

    // Add additional data
    if (data) {
      logContext.data = this.maskSensitiveData(data);
    }

    // Add stack trace for errors
    if (stack) {
      logContext.stack = stack;
    }

    return logContext;
  }

  /**
   * Get trace ID from async local storage (if available)
   */
  private getTraceId(): string | undefined {
    // This can be enhanced with AsyncLocalStorage for request tracking
    return undefined;
  }

  /**
   * Output log to console
   */
  private output(logContext: LogContext) {
    const { level, message } = logContext;

    // Pretty print in development, JSON in production
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(logContext));
    } else {
      // Colorized output for development
      const colors = {
        log: '\x1b[37m',     // white
        error: '\x1b[31m',   // red
        warn: '\x1b[33m',    // yellow
        debug: '\x1b[36m',   // cyan
        verbose: '\x1b[35m', // magenta
      };
      const color = colors[level] || colors.log;
      const reset = '\x1b[0m';

      console.log(
        `${color}[${logContext.timestamp}] [${level.toUpperCase()}] [${logContext.context}]${reset} ${message}`,
      );

      if (logContext.traceId) {
        console.log(`  ${color}TraceID:${reset} ${logContext.traceId}`);
      }

      if (logContext.data) {
        console.log(
          `  ${color}Data:${reset}`,
          inspect(logContext.data, { depth: 3, colors: true }),
        );
      }

      if (logContext.stack) {
        console.log(`  ${color}Stack:${reset}\n${logContext.stack}`);
      }
    }
  }

  log(message: any, context?: string, data?: any) {
    const logContext = this.formatLog('log', message, context, data);
    this.output(logContext);
  }

  error(message: any, stack?: string, context?: string, data?: any) {
    const logContext = this.formatLog('error', message, context, data, stack);
    this.output(logContext);
  }

  warn(message: any, context?: string, data?: any) {
    const logContext = this.formatLog('warn', message, context, data);
    this.output(logContext);
  }

  debug(message: any, context?: string, data?: any) {
    const logContext = this.formatLog('debug', message, context, data);
    this.output(logContext);
  }

  verbose(message: any, context?: string, data?: any) {
    const logContext = this.formatLog('verbose', message, context, data);
    this.output(logContext);
  }

  /**
   * Set log levels (NestJS interface requirement)
   */
  setLogLevels?(levels: LogLevel[]) {
    // Implement if needed
  }
}
