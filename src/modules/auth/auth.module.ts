import { Module } from '@nestjs/common';
import { HmacGuard } from './hmac.guard';

@Module({
  providers: [HmacGuard],
  exports: [HmacGuard],
})
export class AuthModule {}
