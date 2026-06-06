// Walk upward from `base` until a free port is found or `windowSize` is exhausted.
// Doc citation per FR-018: https://nodejs.org/api/net.html

import { createServer } from 'net';

export async function findFreePort(base: number, windowSize = 10): Promise<number> {
  for (let p = base; p < base + windowSize; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`No free port in [${base}, ${base + windowSize})`);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}
