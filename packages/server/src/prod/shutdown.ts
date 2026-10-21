// Clean shutdown for the server. Docker (and Ctrl+C) sends SIGTERM/SIGINT; we then run the
// steps in order — stop matchmaking, tell players, close connections, close the database so
// SQLite writes everything to the main file — and exit. A step that fails is logged and the
// rest still run. If everything takes too long, a hard timer exits anyway (Docker would kill
// the process a little later otherwise).

export interface ShutdownStep {
  name: string;
  run: () => void | Promise<void>;
}

export interface ShutdownOptions {
  steps: ShutdownStep[];
  /** exit anyway after this long (ms) */
  hardTimeoutMs: number;
  exit: (code: number) => void;
  log?: (msg: string) => void;
}

/** Returns the handler for signals; only the first call does anything. */
export const createShutdown = (opts: ShutdownOptions): ((reason: string) => Promise<void>) => {
  let started: Promise<void> | null = null;
  const log = opts.log ?? (() => {});
  return (reason: string) => {
    if (started) return started;
    started = (async () => {
      log(`Shutting down (${reason})…`);
      const timer = setTimeout(() => {
        log('Shutdown took too long; exiting now.');
        opts.exit(1);
      }, opts.hardTimeoutMs);
      timer.unref?.();
      let failed = false;
      for (const step of opts.steps) {
        try {
          await step.run();
        } catch (err) {
          failed = true;
          log(`Shutdown step "${step.name}" failed: ${String(err)}`);
        }
      }
      clearTimeout(timer);
      log('Stopped.');
      opts.exit(failed ? 1 : 0);
    })();
    return started;
  };
};

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
