// Map Maker requests over the game connection: a 'customMap' message and its answer
// ('customMapResult' with the same req number) as a promise.
import type { ClientMsg, NetCore, ServerMsg } from '@space-yz/shared';

export type MapResult = Extract<ServerMsg, { t: 'customMapResult' }>;
type MapRequest = Omit<Extract<ClientMsg, { t: 'customMap' }>, 't' | 'req'>;

let nextReq = 1;

/** Wait until the connection said hello (8 s at most). */
export const whenConnected = (core: NetCore, timeoutMs = 8000): Promise<void> =>
  new Promise((resolve, reject) => {
    const t0 = performance.now();
    const poll = () => {
      if (core.state === 'lobby' || core.state === 'room') return resolve();
      if (core.state === 'closed' || performance.now() - t0 > timeoutMs)
        return reject(new Error('Not connected to the game server.'));
      window.setTimeout(poll, 50);
    };
    poll();
  });

/** Send one Map Maker request; resolves with the answer (rejects with its error). */
export const mapRequest = (
  core: NetCore,
  msg: MapRequest,
  timeoutMs = 30_000,
): Promise<MapResult> =>
  new Promise((resolve, reject) => {
    const req = nextReq++;
    const timer = window.setTimeout(() => {
      off();
      reject(new Error('The server did not answer — try again.'));
    }, timeoutMs);
    const off = core.listen((m) => {
      if (m.t === 'error' && msg.doc !== undefined && /maps sent/.test(m.msg)) {
        // (the big-message limit answers with a plain error)
        window.clearTimeout(timer);
        off();
        reject(new Error(m.msg));
        return;
      }
      if (m.t !== 'customMapResult' || m.req !== req) return;
      window.clearTimeout(timer);
      off();
      if (m.ok) resolve(m);
      else reject(new Error(m.error ?? 'That did not work.'));
    });
    // ('t' first: the server lets only Map Maker messages be big, by their start)
    core.sendJson({ t: 'customMap', req, ...msg });
  });
