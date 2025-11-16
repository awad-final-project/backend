import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import { ThrowFirstErrorValidationPipe } from './libs/utils/pipes';
import { AppModule } from './modules/app/app.module';

async function createApp() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: process.env.CORS_ORIGIN,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      preflightContinue: false,
      optionsSuccessStatus: 204,
      credentials: true,
    },
  });
  const globalPrefix = '';

  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(ThrowFirstErrorValidationPipe);

  const config = new DocumentBuilder()
    .setTitle('User Registration API')
    .setDescription('User Registration API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('', app, document);

  return app;
}

async function bootstrap() {
  const app = await createApp();
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Main application is running on: http://localhost:${port}/`,
  );
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
