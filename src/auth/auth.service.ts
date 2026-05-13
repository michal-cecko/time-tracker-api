import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { loadEnv } from '../config/env';
import { ForgotDto, LoginDto, RefreshDto, RegisterDto, ResetDto } from './dto/auth.dto';

function ms(ttl: string): number {
  const m = /^(\d+)([smhdw])$/.exec(ttl);
  if (!m) return 7 * 24 * 3600 * 1000;
  const n = Number(m[1]);
  const unit = m[2];
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[unit]!;
  return n * mult;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private env = loadEnv();

  private hashRefresh(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(userId: string, email: string, staysLoggedIn: boolean, userAgent?: string, ip?: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: this.env.JWT_ACCESS_TTL as any },
    );

    const refreshTtl = staysLoggedIn ? this.env.JWT_REFRESH_TTL_STAY : this.env.JWT_REFRESH_TTL_DEFAULT;
    const refreshToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: this.env.JWT_REFRESH_SECRET, expiresIn: refreshTtl as any },
    );

    const expiresAt = new Date(Date.now() + ms(refreshTtl));
    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: this.hashRefresh(refreshToken),
        staysLoggedIn,
        userAgent,
        ip,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto, userAgent?: string, ip?: string) {
    if (!this.env.REGISTRATION_ENABLED) {
      throw new ForbiddenException('Registration is closed');
    }
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        avatarSeed: dto.name.slice(0, 1).toUpperCase() || 'L',
        settings: { create: {} },
      },
    });

    const tokens = await this.issueTokens(user.id, user.email, false, userAgent, ip);
    return { user: { id: user.id, email: user.email, name: user.name }, ...tokens };
  }

  async login(dto: LoginDto, userAgent?: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.issueTokens(user.id, user.email, !!dto.staysLoggedIn, userAgent, ip);
    return { user: { id: user.id, email: user.email, name: user.name }, ...tokens };
  }

  async refresh(dto: RefreshDto, userAgent?: string, ip?: string) {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(dto.refreshToken, { secret: this.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const tokenHash = this.hashRefresh(dto.refreshToken);
    const session = await this.prisma.session.findFirst({
      where: { userId: payload.sub, refreshTokenHash: tokenHash, revokedAt: null },
    });
    if (!session) {
      // Reuse detected — revoke all sessions for this user.
      await this.prisma.session.updateMany({
        where: { userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    const tokens = await this.issueTokens(user.id, user.email, session.staysLoggedIn, userAgent, ip);
    return tokens;
  }

  async logout(refreshToken: string) {
    const hash = this.hashRefresh(refreshToken);
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgot(dto: ForgotDto): Promise<{ devToken?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) return {}; // no enumeration
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
      },
    });
    // In dev, surface so the user can complete the flow without email.
    return this.env.NODE_ENV === 'development' ? { devToken: token } : {};
  }

  async reset(dto: ResetDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const rec = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    const passwordHash = await argon2.hash(dto.password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }
}
