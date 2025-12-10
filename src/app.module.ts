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
import { DashboardModule } from './modules/dashboard/dashboard.module';
// import { RootController } from './root.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        PORT: Joi.number().default(3002),
        DATABASE_URL: Joi.string()
          .pattern(/^postgres(ql)?:\/\//)
          .required(),
        INOVA_SECRET: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        HMAC_TIME_WINDOW_MS: Joi.number().default(300000),
        LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
        INOVAFARMA_BUFFER_DIR: Joi.string().default('.data/inovafarma-buffer'),
        INOVAFARMA_BUFFER_BATCH_SIZE: Joi.number().positive().default(25),
        INOVAFARMA_BUFFER_INTERVAL_MS: Joi.number().positive().default(1000),
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
    DashboardModule,
  ],
  controllers: [],
})
export class AppModule {}
