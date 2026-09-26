// Client combat presentation: player models, Boomerangs, lines, preview, viewmodel, HUD,
// 3D audio and kill feedback. Works for offline and online sessions alike.
import * as THREE from 'three';
import type { SimEvent, BoomerangState, PlayerState, Vec3, KillKind } from '@space-yz/shared';
import {
  Phase,
  eyePos,
  predictThrow,
  sub,
  len,
  dot,
  normalize,
  v3,
  scale,
  isFlying,
  projectOnPlane,
  jetpackTuning,
  loadoutOf,
  currentGun,
  gunAmmo,
  gunDef,
  gunConeDeg,
  patternAt,
  qForward,
  qRight,
  qUp,
  madd,
} from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import { PlayerModels } from '../render/players';
import { CombatView } from '../render/combat-view';
import { Viewmodel } from '../render/viewmodel';
import { CombatHud, POWERUP_HUD, type Threat } from '../ui/combat-hud';
import { projectMarker, screenAngle } from '../ui/markers';
import type { LoopHandle } from '../audio';
import type { SoundName } from '../audio';

/** Hearing range (m) of warnings aimed at you: Wind-ups, Laser warnings. */
const DANGER_RANGE = 55;
/** Boomerang whistles: hearing range (m) and how many play at once (nearest first). */
const WHISTLE_RANGE = 45;
const MAX_WHISTLES = 4;

/** Where the sounds of players you can't see are placed: far outside any hearing range. */
const UNHEARD: Vec3 = { x: 1e7, y: 1e7, z: 1e7 };

/** Distance from `p` to the segment a–b. */
const distToSegment = (p: Vec3, a: Vec3, b: Vec3): number => {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(1e-6, dot(ab, ab))));
  return len(sub(p, { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t }));
};

/** CS mode: gunshots carry far (m); reloads only close by. */
const GUNSHOT_RANGE = 70; // was 110 (the whole map): gunfire gave away positions
const RELOAD_RANGE = 18;
const DEG = Math.PI / 180;

/** How far ahead (s) the throw preview leads moving enemies. */
const PREVIEW_LEAD_SEC = 0.6;

const KILL_SOUND: Partial<Record<KillKind, SoundName>> = {
  headshot: 'killHeadshot',
  windup: 'killWindup',
  recall: 'killRecall',
  deflect: 'killDeflect',
};

export class CombatFeature implements ClientFeature {
  models!: PlayerModels;
  view!: CombatView;
  viewmodel = new Viewmodel();
  hud!: CombatHud;
  private whistles = new Map<number, LoopHandle>();
  private windupSounds = new Map<number, boolean>();
  private pullLoops = new Map<number, LoopHandle>();
  private myKills: { t: number; throwId: number }[] = [];
  private streakCount = 0;
  private time = 0;
  private slashed = false;
  private wasAlive = true;
  private camLocal = new THREE.Vector3();
  /** the previewed throw would hit an enemy (crosshair turns red) */
  private onTarget = false;
  private wasAiming = false;
  private aimCurve: number | null = null;
  /** CS mode: this match is played with guns (dim players, gun viewmodel, ammo HUD) */
  private cs = false;
  /** CS mode: the fast extra camera kick of the last shot (degrees, decays) */
  private punchKick = 0;
  statsText: (() => string | null) | null = null;

  init(c: GameClient): void {
    this.models = new PlayerModels();
    this.view = new CombatView(c.session.level);
    c.scene.add(this.models.group, this.view.group);
    this.hud = new CombatHud(c.deps.ui);
    c.overlay = { scene: this.viewmodel.scene, camera: this.viewmodel.camera };
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => this.hud.resize();

  /**
   * A player's team. Online, enemies you can't see are left out of the world, so fall back to
   * the match stats and the room roster; undefined if nobody knows (never guess).
   */
  private teamOf(c: GameClient, id: number): 0 | 1 | undefined {
    const s = c.session;
    return (
      s.world().players.find((p) => p.id === id)?.team ??
      s.match?.()?.stats.find((p) => p.id === id)?.team ??
      s.teams?.()[id]
    );
  }

  /** Screen direction (0 = up, clockwise) of a world point from this frame's camera. */
  private angleOf(c: GameClient, p: Vec3): number {
    const d = this.camLocal.set(p.x, p.y, p.z).applyMatrix4(c.camera.matrixWorldInverse);
    return screenAngle(d.x, d.y, d.z);
  }

  private name(c: GameClient, id: number): string {
    if (id === c.session.localId) return 'You';
    return c.session.names()[id] ?? `Player ${id}`;
  }

  events(c: GameClient, events: SimEvent[]): void {
    const me = c.session.localId;
    const a = c.deps.audio;
    const world = c.session.world();
    const gravity = c.session.local()?.gravity ?? v3(0, -20, 0);
    this.view.onEvents(
      events,
      (id) => this.teamOf(c, id),
      scale(normalize(gravity, v3(0, -1, 0)), 9),
      (id) => this.muzzleOf(c, id),
    );
    // where a player's sound comes from; an enemy you can't see isn't sent to you (anti-wallhack),
    // so their sounds are placed out of hearing range instead of (as before) at your own head
    const posOf = (id: number): Vec3 =>
      world.players.find((p) => p.id === id)?.pos ?? (id === me ? c.eye() : UNHEARD);
    for (const e of events) {
      switch (e.type) {
        case 'throw':
          a.play3d(e.windup ? 'windupFire' : 'throw', posOf(e.player), {
            volume: e.windup ? 1 : 0.7,
            refDistance: 6,
          });
          if (e.player === me) c.shake = Math.max(c.shake, e.windup ? 0.5 : 0.15);
          break;
        case 'windupStart':
          if (!this.windupSounds.get(e.player)) {
            a.play3d('throwWindupCharge', posOf(e.player), {
              volume: 1,
              refDistance: 14,
              maxDistance: DANGER_RANGE,
            });
            this.windupSounds.set(e.player, true);
          }
          break;
        case 'windupReady':
          a.play3d('windupReady', posOf(e.player), {
            refDistance: 12,
            maxDistance: DANGER_RANGE,
          });
          break;
        case 'windupCancel':
          this.windupSounds.delete(e.player);
          break;
        case 'catch':
          if (e.player === me) a.play('catch', { volume: 0.8 });
          else a.play3d('catch', posOf(e.player), { volume: 0.6 });
          break;
        case 'pickup':
          if (e.player === me) a.play('catch', { volume: 0.6, rate: 0.9 });
          break;
        case 'wallHit':
          a.play3d('wallHit', e.pos, { volume: 0.8 });
          break;
        case 'wallBounce':
          a.play3d('wallHit', e.pos, { volume: 0.7, rate: 1.35 });
          break;
        // ---- power-ups ----
        case 'powerupSpawn':
          a.play3d('powerupSpawn', e.pos, { volume: 0.9, refDistance: 14, maxDistance: 90 });
          this.hud.showCenter(`${POWERUP_HUD[e.kind].name} POWER-UP IN THE MIDDLE`, 2);
          break;
        case 'powerupPickup': {
          const d = POWERUP_HUD[e.kind];
          const n =
            e.kind === 1
              ? c.session.config.combat.freezeCharges
              : c.session.config.combat.doubleCharges;
          if (e.player === me) {
            a.play('powerupPickup', { volume: 1 });
            this.hud.showBanner(`${d.name} ×${n}`, true);
          } else {
            a.play3d('powerupPickup', e.pos, { volume: 0.8, refDistance: 10 });
            this.hud.showCenter(`${this.name(c, e.player)} took ${d.name}`, 2);
          }
          break;
        }
        case 'freeze':
          if (e.victim === me) {
            a.play('freeze', { volume: 1 });
            c.shake = Math.max(c.shake, 0.3);
          } else a.play3d('freeze', e.pos, { volume: 0.9, refDistance: 10 });
          if (e.attacker === me) this.hud.showBanner('FROZEN!');
          break;
        case 'twinThrow':
          a.play3d('throw', posOf(e.player), { volume: 0.5, rate: 1.25, refDistance: 6 });
          break;
        case 'twinBounce':
          a.play3d('wallHit', e.pos, { volume: 0.6, rate: 1.5 });
          break;
        case 'twinEnd':
          if (e.wall) a.play3d('wallHit', e.pos, { volume: 0.55, rate: 1.2 });
          break;
        case 'clash':
          a.play3d('clash', e.pos, { volume: 1, refDistance: 10 });
          break;
        case 'deflect':
          a.play3d('deflect', e.pos, { volume: 1, refDistance: 10 });
          if (e.player === me) this.hud.showBanner('DEFLECT!');
          break;
        case 'recallStart':
          a.play3d('recallTelegraph', e.from, { volume: 1, refDistance: 20, maxDistance: 60 });
          // the extra in-your-head warning only when the lethal line passes near you
          if (e.player !== me && e.lethal && distToSegment(c.eye(), e.from, e.to) < 6)
            a.play('recallTelegraph', { volume: 0.5 });
          break;
        case 'recallGo':
          a.play3d('recallWhoosh', posOf(e.player), { volume: 0.9, refDistance: 10 });
          break;
        case 'slash':
          a.play3d('slash', posOf(e.player), { volume: 0.8 });
          if (e.player === me) this.slashed = true;
          break;
        case 'laserWarn':
          a.play3d('laserWarn', posOf(e.player), {
            volume: 0.9,
            refDistance: 12,
            maxDistance: DANGER_RANGE,
          });
          break;
        case 'laserFire':
          a.play3d('laserFire', e.from, { volume: 0.9, refDistance: 10 });
          break;
        case 'gunFire': {
          const name = e.gun === 'ak' ? 'akShot' : 'deagleShot';
          if (e.player === me) {
            a.play(name, {
              volume: e.gun === 'ak' ? 0.75 : 0.9,
              rate: 0.97 + Math.random() * 0.06,
            });
            this.punchKick += gunDef(c.session.config.combat, e.gun).punchDeg;
          } else {
            a.play3d(name, e.from, {
              volume: 1,
              refDistance: 6,
              maxDistance: GUNSHOT_RANGE,
              rate: 0.97 + Math.random() * 0.06,
            });
            this.models.gunKick(e.player);
          }
          break;
        }
        case 'gunReload':
          if (e.player === me) a.play('gunReload', { volume: 0.7 });
          else a.play3d('gunReload', posOf(e.player), { volume: 0.6, maxDistance: RELOAD_RANGE });
          break;
        case 'gunDraw':
          if (e.player === me) a.play('gunDraw', { volume: 0.6 });
          break;
        case 'jetpack': {
          // exhaust puff under the player (yours too: you see it looking down)
          const p = posOf(e.player);
          const up = world.players.find((q) => q.id === e.player)?.up ?? v3(0, 1, 0);
          this.view.fragments.burst(
            { x: p.x - up.x * 0.6, y: p.y - up.y * 0.6, z: p.z - up.z * 0.6 },
            0xffb347,
            10,
            4,
            0.25,
            0.35,
            scale(up, -9),
          );
          if (e.player !== me) a.play3d('thruster', p, { volume: 0.7, rate: 0.75, refDistance: 6 });
          break;
        }
        case 'grenadeThrow':
          a.play3d('grenadeThrow', posOf(e.player), { volume: 0.7 });
          break;
        case 'launch':
          if (e.player !== me) a.play3d('thruster', posOf(e.player), { volume: 0.9, rate: 0.6 });
          break;
        case 'portal':
          // a rift is loud: heard at both ends
          if (e.player !== me) {
            a.play3d('revealPulse', e.from, { volume: 0.9, rate: 1.4, refDistance: 8 });
            a.play3d('revealPulse', e.to, { volume: 0.9, rate: 1.4, refDistance: 8 });
          }
          break;
        case 'grenadeActivate':
          this.pullLoops.get(e.grenade)?.stop(0.05);
          this.pullLoops.set(
            e.grenade,
            a.loop3d('grenadePull', e.pos, { volume: 0.8, refDistance: 8 }),
          );
          break;
        case 'grenadePop':
          this.pullLoops.get(e.grenade)?.stop(0.05);
          this.pullLoops.delete(e.grenade);
          a.play3d('grenadePop', e.pos, { volume: 1, refDistance: 10 });
          break;
        case 'blast': {
          // explosive throw: a heavier, lower bang than a grenade, and a shake nearby
          a.play3d('grenadePop', e.pos, { volume: 1.3, rate: 0.7, refDistance: 12 });
          a.play3d('wallHit', e.pos, { volume: 0.9, rate: 0.6, refDistance: 10 });
          const d = len(sub(e.pos, c.eye()));
          if (d < 12) c.shake = Math.max(c.shake, 0.6 * (1 - d / 12));
          break;
        }
        case 'shieldBreak':
          // a glassy crack: higher and brighter than a normal hit
          a.play3d('deflect', e.pos, { volume: 1.1, rate: 1.5, refDistance: 8 });
          if (e.attacker === me) this.hud.shieldMarker();
          if (e.victim === me) {
            a.play('deflect', { volume: 0.9, rate: 1.3 });
            c.shake = Math.max(c.shake, 0.25);
            this.hud.shieldBroken();
          }
          break;
        case 'hit':
          this.models.flash(e.victim);
          if (e.attacker === me && e.victim !== me) {
            // the kill arrives with its hit (the world may be a snapshot behind online)
            const killed = events.some((k) => k.type === 'kill' && k.victim === e.victim);
            const myTeam = c.session.local()?.team;
            const mate = myTeam !== undefined && this.teamOf(c, e.victim) === myTeam;
            this.hud.hitMarker(e.head, killed && !mate, mate);
            if (!killed && !mate) a.play(e.head ? 'hitHead' : 'hitMarker', { volume: 1.2 });
          }
          if (e.victim === me) {
            a.play('hurt', { volume: 0.8 });
            c.shake = Math.max(c.shake, 0.35);
            this.hud.damageFrom(e.src);
          }
          break;
        case 'takeover':
          if (e.player === me) {
            // you're in the bot's body now: look from it, and say whose it was
            c.syncCameraToPlayer();
            this.hud.showCenter(`You took control of ${this.name(c, e.bot)}`, 2);
          }
          break;
        case 'kill': {
          const mine = e.attacker === me && e.victim !== me;
          this.hud.addKill(
            this.name(c, e.attacker),
            this.teamOf(c, e.attacker),
            this.name(c, e.victim),
            this.teamOf(c, e.victim),
            e.kind,
            e.teamKill,
            e.attacker === me || e.victim === me,
          );
          a.play3d('death', e.pos, { volume: 0.7 });
          if (mine) {
            if (e.teamKill) {
              a.play('teamKill');
              this.hud.showCenter('TEAM KILL', 2, 'warn');
            } else {
              // a gun kill with a head shot plays and reads as a HEADSHOT
              const gunHead =
                (e.kind === 'ak' || e.kind === 'deagle') &&
                events.some(
                  (x) => x.type === 'hit' && x.victim === e.victim && x.attacker === me && x.head,
                );
              this.onMyKill(c, gunHead ? 'headshot' : e.kind, e.throwId);
            }
          }
          if (e.victim === me) {
            c.shake = 0.8;
            this.hud.showCenter(
              e.kind === 'world'
                ? 'Caught outside the zone'
                : e.attacker === me
                  ? 'You eliminated yourself'
                  : `Eliminated by ${this.name(c, e.attacker)}`,
              2.5,
              'warn',
            );
          }
          break;
        }
      }
    }
  }

  private onMyKill(c: GameClient, kind: KillKind, throwId: number): void {
    const a = c.deps.audio;
    const now = this.time;
    this.myKills = this.myKills.filter(
      (k) => now - k.t <= c.session.config.combat.multiKillWindowSec,
    );
    this.myKills.push({ t: now, throwId });
    const n = this.myKills.length;
    this.streakCount = n;
    const sameThrow = throwId !== 0 && this.myKills.filter((k) => k.throwId === throwId).length;
    a.play(KILL_SOUND[kind] ?? 'killConfirm', { volume: 1 });
    if (kind === 'recall' && sameThrow && sameThrow >= 2) a.play('killRecallMulti', { volume: 1 });
    c.shake = Math.max(c.shake, 0.45);
    // ACE: whole enemy team (2+) dead. Online the world leaves out enemies you can't see (dead
    // ones are always sent), so count them from the match stats / roster and treat any
    // missing one as alive.
    const s = c.session;
    const myTeam = s.local()?.team;
    const players = s.world().players;
    const enemyIds = new Set<number>();
    for (const p of players) if (p.team !== myTeam) enemyIds.add(p.id);
    for (const p of s.match?.()?.stats ?? []) if (p.team !== myTeam) enemyIds.add(p.id);
    for (const [id, team] of Object.entries(s.teams?.() ?? {}))
      if (team !== myTeam) enemyIds.add(Number(id));
    const ace =
      enemyIds.size >= 2 &&
      [...enemyIds].every((id) => players.find((p) => p.id === id)?.alive === false);
    if (ace) {
      a.play('multiAce');
      this.hud.showBanner('ACE', true);
    } else if (n >= 4) {
      a.play('multiQuad');
      this.hud.showBanner('QUAD', true);
    } else if (n === 3) {
      a.play('multiTriple');
      this.hud.showBanner('TRIPLE', true);
    } else if (n === 2) {
      a.play('multiDouble');
      this.hud.showBanner('DOUBLE');
    } else {
      this.hud.showBanner(
        kind === 'headshot'
          ? 'HEADSHOT'
          : kind === 'windup'
            ? 'WIND-UP KILL'
            : kind === 'recall'
              ? 'LETHAL RECALL'
              : kind === 'deflect'
                ? 'DEFLECT KILL'
                : 'ELIMINATED',
      );
    }
  }

  frame(c: GameClient, dt: number): void {
    this.time += dt;
    const s = c.session;
    const me = s.local();
    const others = s.others();
    const world = s.world();
    // CS mode (from the config the sim runs with, or the match): guns, dim players
    this.cs = loadoutOf(s.config).guns || s.match?.()?.loadout === 'cs';
    this.models.setCsMode(this.cs);
    for (const b of s.boomerangs())
      if (b.owner !== s.localId)
        this.models.setHolding(b.owner, !this.cs && b.phase === Phase.Held);
    // the player you watch while dead is seen from inside: don't draw their model over the view
    this.models.update(
      c.spectating === null ? others : others.filter((o) => o.id !== c.spectating),
      dt,
      this.time,
    );
    const settings = c.deps.settings;
    const cfg = s.config;
    const booms = s.boomerangs();
    const myB = booms.find((b) => b.owner === s.localId);

    // public lines: Wind-ups and Laser warnings (all players, incl. me)
    const all: PlayerState[] = world.players.filter((p) => p.alive);
    const windups = all
      .filter((p) => p.windup > 0)
      .map((p) => ({
        id: p.id,
        team: p.team,
        eye: eyePos(p, cfg.movement),
        view: p.id === s.localId ? c.fps.quat : p.view,
        full: p.windup >= Math.round(cfg.combat.windupSec * 60),
      }));
    const laserWarns = all
      .filter((p) => p.laserWarn > 0)
      .map((p) => ({
        id: p.id,
        team: p.team,
        eye: eyePos(p, cfg.movement),
        view: p.id === s.localId ? c.fps.quat : p.view,
      }));
    this.view.update(
      {
        boomerangs: booms,
        grenades: s.grenades(),
        twins: s.twins?.() ?? [],
        powerups: s.powerups?.() ?? [],
        teamOf: (id) => this.teamOf(c, id),
        windups,
        laserWarns,
        localId: s.localId,
        camPos: c.eye(),
        pullRadius: cfg.combat.grenadePullRadius,
      },
      dt,
    );

    // tilt meter while your Quick Throw flies out (flick the mouse to tilt it) + the first tips
    const aiming = !!me && me.alive && myB?.phase === Phase.Held && me.aiming;
    if (aiming && !this.wasAiming) this.hud.aimStarted();
    this.wasAiming = aiming;
    this.aimCurve =
      me && me.alive && myB?.phase === Phase.Out && !myB.windup && myB.controller === me.id
        ? myB.curve
        : null;

    // private throw preview (+ steering preview): orange with a teammate on the path, red when
    // it would hit an enemy (checked where a moving enemy will be by then)
    let pred = null;
    if (me && me.alive && myB && settings.throwPreview) {
      const heldView = { ...me, view: c.fps.quat };
      if (myB.phase === Phase.Held && me.aiming) {
        // a release throws straight: flicking in flight tilts it afterwards
        pred = predictThrow(world, s.ctx, heldView, 0, 160, undefined, false, PREVIEW_LEAD_SEC);
      } else if (
        (myB.phase === Phase.Out || myB.phase === Phase.Return) &&
        myB.steerLeft > 0 &&
        c.deps.input.isHeld('alt')
      ) {
        pred = predictThrow(world, s.ctx, heldView, 0, 160, myB, true, PREVIEW_LEAD_SEC);
      }
    }
    this.view.setPreview(pred, settings.throwPreviewOpacity, c.eye());
    this.onTarget = !!pred?.enemyHit;

    // zoom
    if (me && me.alive && me.windup > 0) c.fovOverride = cfg.combat.windupFov;
    else if (me && me.alive && me.aiming) c.fovOverride = cfg.combat.aimFov;
    else c.fovOverride = null;

    this.updatePunch(c, me, dt);

    // viewmodel
    const vfov = c.camera.fov;
    this.viewmodel.resize(c.camera.aspect, vfov);
    if (me) {
      const fullTicks = Math.round(cfg.combat.windupSec * 60);
      this.viewmodel.update(
        {
          held: myB?.phase === Phase.Held,
          laserOut: me.weapon === 1,
          team: me.team,
          aiming: me.aiming,
          windup: Math.min(1, me.windup / fullTicks),
          windupFull: me.windup >= fullTicks,
          slashing: this.slashed,
          laserCharges: me.laserCharges,
          laserMax: cfg.combat.laserCharges,
          laserWarn: me.laserWarn > 0,
          moving: Math.min(1, len(projectOnPlane(me.vel, me.up)) / 9) * (me.grounded ? 1 : 0),
          pitch: Math.asin(Math.max(-1, Math.min(1, dot(c.fps.forward(), c.fps.up)))),
          grounded: me.grounded,
          crouched: me.crouched,
          move: me.move,
          gun: this.cs ? currentGun(me) : null,
          gunShots: me.gunShots,
          gunReload01: this.cs ? this.gunReload01(c, me) : 0,
        },
        dt,
      );
      this.slashed = false;
      this.viewmodel.scene.visible = me.alive;
    }

    // threat indicators: enemy (or deflected) Boomerangs (and twins) heading at me, incl. behind
    const threats: Threat[] = [];
    const twins = s.twins?.() ?? [];
    if (me && me.alive) {
      const eye = c.eye();
      for (const b of [...booms, ...twins]) {
        if (!isFlying(b) || b.controller === s.localId) continue;
        const rel = sub(eye, b.pos);
        const dist = len(rel);
        const speed = len(b.vel);
        if (speed < 1 || dist > 40) continue;
        const closing = dot(normalize(b.vel), normalize(rel));
        const tta = dist / speed;
        if (closing < 0.75 || tta > 1.5) continue;
        const mateThrow = this.teamOf(c, b.controller) === me.team;
        threats.push({
          angle: this.angleOf(c, b.pos),
          intensity: Math.max(0, 1 - tta / 1.5),
          color: mateThrow ? '#ffd34d' : '#ff3b4f',
        });
      }
      // recall telegraph lines through me
      for (const b of booms) {
        if (
          b.phase !== Phase.RecallTelegraph ||
          !b.recallLethal ||
          b.owner === s.localId ||
          !b.recallFrom ||
          !b.recallTo
        )
          continue;
        const seg = sub(b.recallTo, b.recallFrom);
        const t = Math.max(
          0,
          Math.min(1, dot(sub(eye, b.recallFrom), seg) / Math.max(1e-6, dot(seg, seg))),
        );
        const p = {
          x: b.recallFrom.x + seg.x * t,
          y: b.recallFrom.y + seg.y * t,
          z: b.recallFrom.z + seg.z * t,
        };
        if (len(sub(p, eye)) < 2.5)
          threats.push({ angle: this.angleOf(c, b.recallFrom), intensity: 1, color: '#ffffff' });
      }
    }

    // 3D whistles: louder & higher as they close in; only the nearest few (a 5v5 full of
    // whistles is just noise)
    const seen = new Set<number>();
    const a = c.deps.audio;
    if (a.unlocked) {
      const eye = c.eye();
      const near = [...booms, ...twins]
        .filter((b) => isFlying(b) && len(sub(b.pos, eye)) < WHISTLE_RANGE)
        .sort((x, y) => len(sub(x.pos, eye)) - len(sub(y.pos, eye)))
        .slice(0, MAX_WHISTLES);
      for (const b of near) {
        seen.add(b.id);
        let h = this.whistles.get(b.id);
        if (!h) {
          h = a.loop3d('boomerangWhistle', b.pos, {
            volume: 0.9,
            refDistance: 8,
            maxDistance: WHISTLE_RANGE,
          });
          this.whistles.set(b.id, h);
        }
        h.setPosition(b.pos);
        const rel = sub(eye, b.pos);
        const closing = dot(b.vel, normalize(rel));
        h.setRate(Math.max(0.7, Math.min(1.9, 1 + closing / 60)) * (b.windup ? 1.3 : 1));
      }
    }
    for (const [id, h] of this.whistles)
      if (!seen.has(id)) {
        h.stop(0.08);
        this.whistles.delete(id);
      }

    // HUD
    if (me) {
      if (me.alive && !this.wasAlive) this.hud.clearTransient(); // respawned / new round
      this.wasAlive = me.alive;
      const fullTicks = Math.round(cfg.combat.windupSec * 60);
      const status: 'held' | 'flying' | 'dropped' | 'recalling' | 'steer' = !myB
        ? 'held'
        : myB.phase === Phase.Held
          ? 'held'
          : myB.phase === Phase.Dropped
            ? 'dropped'
            : myB.phase === Phase.Recall || myB.phase === Phase.RecallTelegraph
              ? 'recalling'
              : 'flying';
      // nothing to go and get while you're dead
      const marker =
        me.alive && myB && myB.phase !== Phase.Held
          ? projectMarker(myB.pos, c.camera, window.innerWidth, window.innerHeight)
          : null;
      this.hud.update(
        dt,
        {
          hp: me.hp,
          maxHp: cfg.combat.maxHp,
          boomerang: status,
          shield: !!me.shield && me.alive,
          blastIn: this.cs ? undefined : Math.max(0, cfg.combat.blastEvery - 1 - me.blastCount),
          blastFlying: !!myB?.explosive && myB.phase !== Phase.Held,
          boomerangDist: myB ? len(sub(myB.pos, me.pos)) : 0,
          laserCharges: me.laserCharges,
          laserMax: cfg.combat.laserCharges,
          laserRecharge01: 0,
          laserReserve: me.laserReserve,
          laserReload01:
            me.laserReload > 0
              ? 1 - me.laserReload / Math.max(1, Math.round(cfg.combat.laserReloadSec * 60))
              : 0,
          weapon: me.weapon === 1 || myB?.phase !== Phase.Held ? 'laser' : 'boomerang',
          grenades: me.grenadesLeft,
          dashReady01: 1 - me.dashCd / Math.max(1, Math.round(cfg.movement.dashCooldownSec * 60)),
          // (the sky duel's tank is bigger)
          jetReady01:
            me.jetFuel /
            Math.max(1e-6, jetpackTuning(cfg.movement, c.session.level.def, me.pos).fuel),
          steer01:
            myB && myB.phase !== Phase.Held
              ? myB.steerLeft / Math.max(1, Math.round(cfg.combat.steerSec * 60))
              : 0,
          windup01: Math.min(1, me.windup / fullTicks),
          windupFull: me.windup >= fullTicks,
          windupHold01: me.windupHeld / Math.max(1, Math.round(cfg.combat.windupHoldSec * 60)),
          alive: me.alive,
          onTarget: me.alive && this.onTarget,
          aimCurve: this.aimCurve,
          powerup:
            me.powerup === 1 || me.powerup === 2
              ? {
                  kind: me.powerup,
                  charges: me.powerupCharges,
                  max: me.powerup === 1 ? cfg.combat.freezeCharges : cfg.combat.doubleCharges,
                }
              : null,
          stun01: me.stun / Math.max(1, Math.round(cfg.combat.freezeSec * 60)),
          guns: this.cs
            ? {
                active: currentGun(me),
                ak: gunAmmo(me, 'ak'),
                deagle: gunAmmo(me, 'deagle'),
                reload01: this.gunReload01(c, me),
                spreadPx:
                  (Math.tan(gunConeDeg(me, s.ctx) * DEG) /
                    Math.tan(((c.camera.fov / 2) * Math.PI) / 180)) *
                  (window.innerHeight / 2),
              }
            : null,
        },
        threats,
        marker,
        (p) => this.angleOf(c, p),
      );
      // between rounds the scoreboard / results say it all (and would sit on top of it)
      const m = s.match?.() ?? null;
      this.hud.setDeath(
        me.alive || c.panelOpen
          ? null
          : m?.phase === 'live'
            ? 'ELIMINATED · back next round'
            : 'ELIMINATED',
      );
    }
    this.hud.setStats(this.statsText?.() ?? null);
    this.hud.setSpectate(
      c.spectating !== null && c.spectating >= 0 && !c.panelOpen
        ? `SPECTATING ${this.name(c, c.spectating)}${
            this.teamOf(c, c.spectating) === me?.team ? '' : ' (enemy)'
          } · LMB / RMB switch${c.takeOverTarget() !== null ? ' · E take control' : ''}`
        : null,
    );
  }

  /** CS mode: reload progress of the gun in hand (0 = not reloading). */
  private gunReload01(c: GameClient, me: PlayerState): number {
    if (me.gunReload <= 0) return 0;
    const g = gunDef(c.session.config.combat, currentGun(me));
    return 1 - me.gunReload / Math.max(1, Math.round(g.reloadSec * 60));
  }

  /** Where a player's gun barrel is (CS mode tracers start there). */
  private muzzleOf(c: GameClient, id: number): Vec3 | null {
    const s = c.session;
    if (id === s.localId) {
      // your own: from the viewmodel's barrel, low right of the crosshair
      const q = c.fps.quat;
      const eye = c.eye();
      return madd(madd(madd(eye, qRight(q), 0.11), qUp(q), -0.1), qForward(q), 0.55);
    }
    const p = s.others().find((o) => o.id === id);
    if (!p) return null;
    const eye = eyePos(p as unknown as PlayerState, s.config.movement);
    return madd(madd(madd(eye, qRight(p.view), 0.25), qUp(p.view), -0.2), qForward(p.view), 0.7);
  }

  /** CS mode recoil on the camera: part of the spray (like CS) plus a quick kick per shot. */
  private updatePunch(c: GameClient, me: PlayerState | undefined, dt: number): void {
    this.punchKick *= Math.exp(-dt * 22);
    if (!this.cs || !me || !me.alive) {
      c.viewPunch = { pitch: 0, yaw: 0 };
      this.punchKick = 0;
      return;
    }
    const cfg = c.session.config.combat;
    const [pp, py] = patternAt(gunDef(cfg, currentGun(me)).pattern, me.gunSpray);
    const k = cfg.gunViewTracking;
    c.viewPunch = { pitch: (pp * k + this.punchKick) * DEG, yaw: py * k * DEG };
  }

  dispose(c: GameClient): void {
    c.viewPunch = { pitch: 0, yaw: 0 };
    for (const h of this.whistles.values()) h.stop(0.05);
    for (const h of this.pullLoops.values()) h.stop(0.05);
    this.models.dispose();
    this.view.dispose();
    this.hud.dispose();
    c.overlay = null;
    window.removeEventListener('resize', this.onResize);
  }

  /** Is the Boomerang state useful for markers? */
  static visibleBoomerang(b: BoomerangState): boolean {
    return b.phase !== Phase.Held;
  }
}
