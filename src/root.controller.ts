import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller()
export class RootController {
  @Get()
  redirectToLogin(@Res() res: Response) {
    res.redirect('/login.html');
  }
}
