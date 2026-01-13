import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { ThrowFirstErrorValidationPipe } from './libs/utils/pipes';
import { AppModule } from './modules/app/app.module';
import {
  CustomLogger,
  HttpLoggingInterceptor,
  GlobalExceptionFilter,
} from './libs/utils';

async function createApp() {
  // Create app with custom logger
  const customLogger = new CustomLogger('Bootstrap');
  
  const app = await NestFactory.create(AppModule, {
    logger: customLogger,
    cors: {
      origin: process.env.CORS_ORIGIN || ['http://localhost:5173', 'http://localhost:3000'],
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      preflightContinue: false,
      optionsSuccessStatus: 204,
      credentials: true,
    },
  });
  const globalPrefix = '';

  // Enable cookie parsing for httpOnly cookies
  app.use(cookieParser());
  
  app.setGlobalPrefix(globalPrefix);
  
  // Apply global pipes
  app.useGlobalPipes(ThrowFirstErrorValidationPipe);
  
  // Apply global exception filter for detailed error logging
  app.useGlobalFilters(new GlobalExceptionFilter());
  
  // Apply HTTP logging interceptor for request/response logging
  app.useGlobalInterceptors(new HttpLoggingInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Email Application API')
    .setDescription('API documentation for the Email Application')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('', app, document);

  return app;
}

async function bootstrap() {
  const logger = new CustomLogger('Bootstrap');
  
  try {
    const app = await createApp();
    const port = process.env.PORT || 3000;
    const env = process.env.NODE_ENV || 'development';
    
    await app.listen(port, '0.0.0.0');
    
    logger.log(`🚀 Application started successfully`, undefined, {
      port,
      environment: env,
      url: `http://0.0.0.0:${port}/`,
      swaggerDocs: `http://0.0.0.0:${port}/`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('❌ Failed to start application', error.stack, undefined, {
      error: error.message,
    });
    process.exit(1);
  }
}

// For Vercel serverless deployment
export default async (req: any, res: any) => {
  const app = await createApp();
  await app.init();
  const expressApp = app.getHttpAdapter().getInstance();
  return expressApp(req, res);
};

// For local development
if (require.main === module) {
  bootstrap();
}
