import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { loadEnv } from '../../config/env';

export interface JwtAccessPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: loadEnv().JWT_ACCESS_SECRET,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtAccessPayload) {
    return { id: payload.sub, email: payload.email };
  }
}
