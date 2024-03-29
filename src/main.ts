import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfig } from './modules/configuration/configuration.service';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { VersioningType, ValidationPipe } from '@nestjs/common';
import session from 'express-session';
import R from 'ramda';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfig);
  const port = config.values.APP_PORT || 8080;
  const sessionSecret = R.path(['SESSION_SECRET'], config.values);

  app.setGlobalPrefix('v1', {
    exclude: [
      'internal/orders/match',
      'internal/orders/cancel',
      'internal/orders/track',
    ],
  });

  // Middlewares
  app.use(helmet());

  // Swagger Documentation
  const options = new DocumentBuilder()
    .setTitle('Universe Marcketplace API')
    .setDescription('Universe Marcketplace API Documentation')
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('v1/doc', app, document);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  app.enableVersioning({
    type: VersioningType.URI,
  });

  if (R.isNil(sessionSecret)) {
    throw new Error('No session secret');
  }

  const sessionOptions = {
    secret: <string>sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  };

  if (config.values.APP_ENV === 'production') {
    sessionOptions.cookie.secure = true;
  }

  app.use(session(sessionOptions));

  await app.listen(port);
}
bootstrap();
