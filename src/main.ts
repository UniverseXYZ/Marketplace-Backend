import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfig } from './modules/configuration/configuration.service';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfig);
  const port = config.values.app.port;

  // Middlewares
  app.use(helmet());

  // Swagger Documentation
  const options = new DocumentBuilder()
    .setTitle('Universal Marcketplace API')
    .setDescription('Universal Marcketplace API Documentation')
    .addTag('health')
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('doc', app, document);

  await app.listen(port);
}
bootstrap();
