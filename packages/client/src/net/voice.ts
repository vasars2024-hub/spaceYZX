// Voice chat: a WebRTC audio mesh between the humans in an online room. The game server only
// relays the offers/answers (JSON control messages); audio goes player to player.
//
// - The lower player id offers, the higher one answers (no glare). Offers/answers carry all
//   ICE candidates (gathered up front, a few seconds at most), so signaling is 2 messages.
// - Every connection has an audio transceiver from the start with nothing on it; push-to-talk
//   puts the mic track on exactly the connections that should hear you (replaceTrack): team
//   talk only to teammates, all talk to everyone. Enemies never get your team-channel audio.
// - The mic is only asked for the first time you press a talk key.
// - A connection that isn't up after CONNECT_TIMEOUT_MS (strict NATs, no TURN server) is
//   dropped with a note and retried later; text chat keeps working either way.
import type { NetCore, RtcSignal } from '@space-yz/shared';
import { RTC_SDP_MAX } from '@space-yz/shared';

export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const CONNECT_TIMEOUT_MS = 10_000;
const RETRY_MS = 30_000;
const GATHER_MS = 2500;
const SYNC_MS = 400;

export type TalkMode = 'team' | 'all' | null;

/** Who gets your mic: team talk → teammates only, all talk → every other human. */
export const talkTargets = (
  mode: TalkMode,
  peerTeams: ReadonlyMap<number, 0 | 1>,
  myTeam: 0 | 1,
): Set<number> => {
  const out = new Set<number>();
  if (!mode) return out;
  for (const [id, team] of peerTeams) if (mode === 'all' || team === myTeam) out.add(id);
  return out;
};

export interface VoiceHooks {
  /** voice chat switched on in the settings */
  enabled(): boolean;
  /** how loud this player's voice should play right now (0 = silent) */
  volumeFor(id: number): number;
  /** a short message for the player ("voice unavailable…") */
  note(text: string): void;
  nameOf(id: number): string;
}

interface Peer {
  id: number;
  pc: RTCPeerConnection;
  sender: RTCRtpSender | null;
  audio: HTMLAudioElement | null;
  startedAt: number;
  connected: boolean;
  /** the mic track is on this connection */
  sending: boolean;
}

/** Resolves when ICE gathering is done (or after GATHER_MS with what we have). */
const gathered = (pc: RTCPeerConnection): Promise<void> =>
  new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const timer = window.setTimeout(resolve, GATHER_MS);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        window.clearTimeout(timer);
        resolve();
      }
    });
  });

export class VoiceMesh {
  readonly supported = typeof RTCPeerConnection !== 'undefined';
  private peers = new Map<number, Peer>();
  /** peers who have voice off (they said bye): don't offer until they say hi */
  private declined = new Set<number>();
  private retryAt = new Map<number, number>();
  /** peers we already told the player about (one note per failure streak) */
  private noted = new Set<number>();
  private mic: MediaStreamTrack | null = null;
  micState: 'none' | 'asking' | 'ready' | 'denied' = 'none';
  /** the talk key held right now */
  private mode: TalkMode = null;
  /** what we told the others (only once the mic is live) */
  announced: TalkMode = null;
  private wasEnabled: boolean | null = null;
  private lastSync = -1e9;
  private unsub: () => void;
  private disposed = false;

  constructor(
    private core: NetCore,
    private hooks: VoiceHooks,
  ) {
    this.unsub = core.listen((msg) => {
      if (msg.t === 'rtc') void this.onSignal(msg.from, msg.data);
    });
  }

  private get me(): number {
    return this.core.localId;
  }

  private humans(): { id: number; team: 0 | 1 }[] {
    return this.core.roster.filter((p) => !p.bot && p.id !== this.me);
  }

  /** Voice connections that are up. */
  connectedCount(): number {
    let n = 0;
    for (const p of this.peers.values()) if (p.connected) n++;
    return n;
  }

  /** Push-to-talk: the key held now (null = none). */
  setTalk(mode: TalkMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode && this.micState === 'none' && this.supported && this.hooks.enabled())
      void this.getMic();
    this.applyTalk();
  }

  /** Call every frame: keeps the connections in line with the room, volumes and talk. */
  update(now: number): void {
    if (this.disposed) return;
    const enabled = this.supported && this.hooks.enabled();
    if (enabled !== this.wasEnabled) {
      const first = this.wasEnabled === null;
      this.wasEnabled = enabled;
      // switched in the settings: lower ids offer, so ask them to (again); when switching
      // off, tell everyone so they stop offering
      if (!first)
        for (const h of this.humans()) {
          if (enabled && h.id < this.me) this.core.sendRtc(h.id, { kind: 'hi' });
          if (!enabled) this.core.sendRtc(h.id, { kind: 'bye' });
        }
      if (!enabled) for (const id of [...this.peers.keys()]) this.closePeer(id);
      this.applyTalk();
    }
    for (const p of this.peers.values()) this.applyVolume(p);
    if (now - this.lastSync < SYNC_MS) return;
    this.lastSync = now;
    const humans = this.humans();
    const ids = new Set(humans.map((h) => h.id));
    for (const id of [...this.peers.keys()]) if (!ids.has(id)) this.closePeer(id);
    for (const id of this.declined) if (!ids.has(id)) this.declined.delete(id);
    if (!enabled) return;
    for (const h of humans) {
      if (this.peers.has(h.id) || h.id < this.me || this.declined.has(h.id)) continue;
      if (now < (this.retryAt.get(h.id) ?? 0)) continue;
      void this.offer(h.id);
    }
    for (const p of [...this.peers.values()])
      if (!p.connected && now - p.startedAt > CONNECT_TIMEOUT_MS) this.fail(p);
    this.applyTalk();
  }

  private newPeer(id: number): Peer {
    this.closePeer(id);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer: Peer = {
      id,
      pc,
      sender: null,
      audio: null,
      startedAt: performance.now(),
      connected: false,
      sending: false,
    };
    this.peers.set(id, peer);
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      peer.audio ??= new Audio();
      peer.audio.autoplay = true;
      peer.audio.srcObject = stream;
      this.applyVolume(peer);
      void peer.audio.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (this.peers.get(id) !== peer) return;
      const s = pc.connectionState;
      if (s === 'connected') {
        peer.connected = true;
        this.noted.delete(id);
        this.retryAt.delete(id);
      } else if (s === 'failed') this.fail(peer);
    };
    return peer;
  }

  private async offer(id: number): Promise<void> {
    const peer = this.newPeer(id);
    const pc = peer.pc;
    try {
      peer.sender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      if (this.peers.get(id) !== peer || !pc.localDescription) return;
      this.sendSdp(peer, 'offer', pc.localDescription.sdp);
    } catch {
      if (this.peers.get(id) === peer) this.fail(peer);
    }
  }

  private async answer(id: number, sdp: string): Promise<void> {
    const peer = this.newPeer(id);
    const pc = peer.pc;
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      const tr = pc.getTransceivers()[0];
      if (tr) {
        tr.direction = 'sendrecv';
        peer.sender = tr.sender;
      }
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      if (this.peers.get(id) !== peer || !pc.localDescription) return;
      this.sendSdp(peer, 'answer', pc.localDescription.sdp);
      this.applyTalk();
    } catch {
      if (this.peers.get(id) === peer) this.fail(peer);
    }
  }

  /** The server drops oversized SDPs (and closes sockets over 16 KB): never send one. */
  private sendSdp(peer: Peer, kind: 'offer' | 'answer', sdp: string): void {
    if (sdp.length > RTC_SDP_MAX) return this.fail(peer);
    this.core.sendRtc(peer.id, { kind, sdp });
  }

  private async onSignal(from: number, data: RtcSignal): Promise<void> {
    if (this.disposed || !this.humans().some((h) => h.id === from)) return;
    const enabled = this.supported && this.hooks.enabled();
    switch (data.kind) {
      case 'offer':
        if (!enabled) this.core.sendRtc(from, { kind: 'bye' });
        else if (typeof data.sdp === 'string') await this.answer(from, data.sdp);
        return;
      case 'answer': {
        const peer = this.peers.get(from);
        if (!peer || peer.pc.signalingState !== 'have-local-offer' || !data.sdp) return;
        try {
          await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
          this.applyTalk();
        } catch {
          this.fail(peer);
        }
        return;
      }
      case 'bye':
        this.closePeer(from);
        if (this.me < from) this.declined.add(from);
        return;
      case 'hi':
        // they switched voice on (again): connect afresh
        this.declined.delete(from);
        this.retryAt.delete(from);
        this.closePeer(from);
        return;
    }
  }

  private fail(peer: Peer): void {
    this.closePeer(peer.id);
    this.retryAt.set(peer.id, performance.now() + RETRY_MS);
    if (!this.noted.has(peer.id)) {
      this.noted.add(peer.id);
      this.hooks.note(
        `Voice unavailable with ${this.hooks.nameOf(peer.id)} (network blocks it) — text chat still works`,
      );
    }
  }

  private closePeer(id: number): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    p.pc.ontrack = null;
    p.pc.onconnectionstatechange = null;
    try {
      p.pc.close();
    } catch {
      /* already closed */
    }
    if (p.audio) {
      p.audio.pause();
      p.audio.srcObject = null;
    }
  }

  private applyVolume(p: Peer): void {
    if (!p.audio) return;
    const v = Math.max(0, Math.min(1, this.hooks.volumeFor(p.id)));
    p.audio.muted = v <= 0;
    if (v > 0 && Math.abs(p.audio.volume - v) > 0.001) p.audio.volume = v;
  }

  private async getMic(): Promise<void> {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) {
      this.micState = 'denied';
      this.hooks.note(
        'No microphone access here (voice needs an https page) — you can still listen',
      );
      return;
    }
    this.micState = 'asking';
    try {
      const stream = await md.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.mic = stream.getAudioTracks()[0] ?? null;
      if (this.disposed) {
        this.mic?.stop();
        return;
      }
      this.micState = this.mic ? 'ready' : 'denied';
    } catch {
      this.micState = 'denied';
    }
    if (this.micState === 'denied')
      this.hooks.note(
        'Microphone blocked — allow it in the browser (lock icon in the address bar)',
      );
    this.applyTalk();
  }

  /** Put the mic on the right connections and tell the room who's talking. */
  private applyTalk(): void {
    if (this.disposed) return;
    const live = this.micState === 'ready' && this.supported && this.hooks.enabled();
    const active: TalkMode = live ? this.mode : null;
    if (active !== this.announced) {
      this.announced = active;
      this.core.sendVoice(active !== null, active === 'all');
    }
    const teams = new Map(this.humans().map((h) => [h.id, h.team] as const));
    const myTeam = this.core.roster.find((p) => p.id === this.me)?.team ?? 0;
    const targets = talkTargets(active, teams, myTeam);
    for (const p of this.peers.values()) {
      if (!p.sender) continue;
      const want = targets.has(p.id) && !!this.mic;
      if (want === p.sending) continue;
      p.sending = want;
      void p.sender.replaceTrack(want ? this.mic : null).catch(() => {});
    }
  }

  /** Is the mic asked for / live right now (for the HUD)? */
  talking(): TalkMode {
    return this.mode;
  }

  dispose(): void {
    if (this.announced) this.core.sendVoice(false, false);
    this.disposed = true;
    this.unsub();
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.mic?.stop();
    this.mic = null;
  }
}
