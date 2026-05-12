import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

// Move the Socket.IO HTTP transport path from the default `/socket.io/` to
// `/realtime/socket.io/` so it sits under the same `/realtime` Traefik
// PathPrefix used for the WS namespace. Without this, the polling/upgrade
// HTTP requests hit `/socket.io/...` which Traefik routes to the SPA.
export class LapseIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    return super.createIOServer(port, {
      ...options,
      path: '/realtime/socket.io/',
    });
  }
}
