import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import * as Joi from 'joi';

import { AuthModule } from './modules/auth/auth.module';
import { InovafarmaModule } from './modules/inovafarma/inovafarma.module';
import { ProductsModule } from './modules/products/products.module';
import { PharmaciesModule } from './modules/pharmacies/pharmacies.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProcessProductsModule } from './jobs/process-products/process-products.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        PORT: Joi.number().default(3002),
        DATABASE_URL: Joi.string().uri().required(),
        INOVA_SECRET: Joi.string().required(),
        REDIS_URL: Joi.string().uri().required(),
        HMAC_TIME_WINDOW_MS: Joi.number().default(300000),
        LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
      }),
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level: configService.get<string>('LOG_LEVEL', 'info'),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    AuthModule,
    ProcessProductsModule,
    PharmaciesModule,
    InovafarmaModule,
    ProductsModule,
  ],
})
export class AppModule {}
