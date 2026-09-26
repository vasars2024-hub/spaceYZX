// Lag compensation limits, shared so clients predict exactly what the server will allow:
// hits are judged against what the shooter saw, but never further back than this.

export const LAG_COMP = {
  /** the most network latency (ping) a shot is compensated for (the build plan's ~175 ms cap) */
  maxLatencyMs: 175,
  /**
   * Every client also draws other players ~3–6 ticks in the past for smooth interpolation;
   * that part is always compensated (up to this much) on top of the latency cap.
   */
  interpAllowanceMs: 100,
  /**
   * ...and sends each input a few ticks early so it arrives before the server needs it (the
   * input lead, bigger on jittery connections): compensated too.
   */
  leadAllowanceMs: 50,
  /** history the server keeps: enough for the largest allowed rewind */
  historyMs: 350,
};

/** Largest total rewind (latency cap + interpolation and input-lead allowances). */
export const MAX_REWIND_MS =
  LAG_COMP.maxLatencyMs + LAG_COMP.interpAllowanceMs + LAG_COMP.leadAllowanceMs;
