import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ForgotDto, LoginDto, RefreshDto, RegisterDto, ResetDto } from './dto/auth.dto';
import { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { loadEnv } from '../config/env';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private auth: AuthService) {}

  private clientInfo(req: FastifyRequest) {
    return {
      userAgent: (req.headers['user-agent'] as string) ?? undefined,
      ip: req.ip,
    };
  }

  // Read-only flags the client can use to render the right auth UI.
  @Get('config')
  config() {
    const env = loadEnv();
    return { registrationEnabled: env.REGISTRATION_ENABLED };
  }

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: FastifyRequest) {
    const { userAgent, ip } = this.clientInfo(req);
    return this.auth.register(dto, userAgent, ip);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: FastifyRequest) {
    const { userAgent, ip } = this.clientInfo(req);
    return this.auth.login(dto, userAgent, ip);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() req: FastifyRequest) {
    const { userAgent, ip } = this.clientInfo(req);
    return this.auth.refresh(dto, userAgent, ip);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@Body() dto: RefreshDto, @CurrentUser() _user: AuthUser) {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('forgot')
  @HttpCode(204)
  async forgot(@Body() dto: ForgotDto) {
    const out = await this.auth.forgot(dto);
    // In dev, log the token so the user can complete the flow.
    if (out.devToken) console.log(`[dev] password reset token for ${dto.email}: ${out.devToken}`);
  }

  @Post('reset')
  @HttpCode(204)
  async reset(@Body() dto: ResetDto) {
    await this.auth.reset(dto);
  }
}
