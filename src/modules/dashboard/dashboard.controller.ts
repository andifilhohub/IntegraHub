import { Body, Controller, Get, Post, Query, UnauthorizedException, Res } from '@nestjs/common';
import { Response } from 'express';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Post('auth')
  async authenticate(@Body('secret') secret: string) {
    const isValid = await this.dashboardService.authenticate(secret);
    if (!isValid) {
      throw new UnauthorizedException('Invalid secret');
    }
    return { authenticated: true, token: secret };
  }

  @Get('buffer')
  async getBufferFiles(@Query('token') token: string) {
    const isValid = await this.dashboardService.authenticate(token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid token');
    }
    return this.dashboardService.getBufferFiles();
  }

  @Get('products')
  async getProcessedProducts(
    @Query('token') token: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const isValid = await this.dashboardService.authenticate(token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid token');
    }
    
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    
    return this.dashboardService.getProcessedProducts(pageNum, limitNum);
  }

  @Get('stats')
  async getStats(@Query('token') token: string) {
    const isValid = await this.dashboardService.authenticate(token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid token');
    }
    return this.dashboardService.getStats();
  }
}
