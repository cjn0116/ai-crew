import type {Server} from 'node:http';
import type {Duplex} from 'node:stream';

import WebSocket, {WebSocketServer, type RawData} from 'ws';

import type {MattermostCredentials} from './credentials.ts';

export function buildMattermostWebSocketTarget(credentials: MattermostCredentials, incomingUrl: string) {
  const suffix = incomingUrl.slice('/api/v4'.length);
  const base = credentials.base.replace(/^http/, 'ws').replace(/\/$/, '');
  return {
    url: `${base}/mattermost/api/v4${suffix}`,
    headers: {authorization: `Bearer ${credentials.mattermostToken}`},
  };
}

export function attachMattermostWebSocketProxy(
  server: Server,
  credentials: () => Promise<MattermostCredentials>,
) {
  const browserServer = new WebSocketServer({noServer: true});

  server.on('upgrade', async (request, socket: Duplex, head) => {
    const incomingUrl = request.url ?? '';
    if (new URL(incomingUrl, 'http://localhost').pathname !== '/api/v4/websocket') {
      socket.destroy();
      return;
    }

    try {
      const target = buildMattermostWebSocketTarget(await credentials(), incomingUrl);
      const upstream = new WebSocket(target.url, {headers: target.headers});

      upstream.once('open', () => {
        browserServer.handleUpgrade(request, socket, head, (browser) => {
          const forward = (destination: WebSocket) => (data: RawData, binary: boolean) => {
            if (destination.readyState === WebSocket.OPEN) {
              destination.send(data, {binary});
            }
          };
          browser.on('message', forward(upstream));
          upstream.on('message', forward(browser));
          browser.once('close', () => upstream.close());
          upstream.once('close', () => browser.close());
          browser.once('error', () => upstream.close());
          upstream.once('error', () => browser.close());
        });
      });
      upstream.once('error', () => socket.destroy());
    } catch {
      socket.destroy();
    }
  });
}
