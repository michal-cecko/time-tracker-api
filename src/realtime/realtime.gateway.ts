import { Logger, UnauthorizedException } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { loadEnv } from '../config/env';

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(private jwt: JwtService) {}

  afterInit() {
    this.logger.log('Realtime gateway online @ /realtime');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, '') as string | undefined);
      if (!token) throw new UnauthorizedException('Missing token');
      const env = loadEnv();
      const payload = await this.jwt.verifyAsync(token, { secret: env.JWT_ACCESS_SECRET });
      const userId = (payload as any).sub as string;
      client.data.userId = userId;
      await client.join(`user:${userId}`);
      client.emit('hello', { userId });
    } catch (e) {
      this.logger.warn(`WS auth failed: ${(e as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {
    // no-op
  }
}
