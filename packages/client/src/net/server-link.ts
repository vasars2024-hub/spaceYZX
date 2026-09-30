// Title-screen connection check (ping). The game connection lives in the net session (M4).
export class ServerLink {
  ok: boolean | null = null;
  text = 'Connecting to server…';
  pingMs = 0;
  onStatus: (ok: boolean | null, text: string) => void = () => {};
  private ws: WebSocket | null = null;
  private timer = 0;

  connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      const ping = () => ws.send(JSON.stringify({ t: 'ping', c: performance.now() }));
      ping();
      this.timer = window.setInterval(ping, 2000);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data) as { t: string; c?: number };
        if (msg.t === 'pong' && typeof msg.c === 'number') {
          this.pingMs = Math.round(performance.now() - msg.c);
          this.set(true, `Server: connected · ${this.pingMs} ms`);
        }
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      window.clearInterval(this.timer);
      this.set(false, 'Server: offline (practice modes still work)');
      window.setTimeout(() => this.connect(), 3000);
    };
  }

  private set(ok: boolean | null, text: string): void {
    this.ok = ok;
    this.text = text;
    this.onStatus(ok, text);
  }

  emitStatus(): void {
    this.onStatus(this.ok, this.text);
  }

  close(): void {
    this.ws?.close();
  }
}
