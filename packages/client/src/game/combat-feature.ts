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
} from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import { PlayerModels } from '../render/players';
import { CombatView } from '../render/combat-view';
import { Viewmodel } from '../render/viewmodel';
import { CombatHud, projectMarker, type Threat } from '../ui/combat-hud';
import type { LoopHandle } from '../audio';
import type { SoundName } from '../audio';

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
  statsText: (() => string | null) | null = null;

  init(c: GameClient): void {
    const local = () => c.session.local();
    this.models = new PlayerModels(() => local()?.team ?? 0);
    this.view = new CombatView(c.session.level);
    c.scene.add(this.models.group, this.view.group);
    this.hud = new CombatHud(c.deps.ui);
    c.overlay = { scene: this.viewmodel.scene, camera: this.viewmodel.camera };
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => this.hud.resize();

  private teamOf(c: GameClient, id: number): 0 | 1 | undefined {
    return c.session.world().players.find((p) => p.id === id)?.team;
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
    );
    const posOf = (id: number): Vec3 => world.players.find((p) => p.id === id)?.pos ?? c.eye();
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
            a.play3d('throwWindupCharge', posOf(e.player), { volume: 1, refDistance: 14 });
            this.windupSounds.set(e.player, true);
          }
          break;
        case 'windupReady':
          a.play3d('windupReady', posOf(e.player), { refDistance: 12 });
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
        case 'clash':
          a.play3d('clash', e.pos, { volume: 1, refDistance: 10 });
          break;
        case 'deflect':
          a.play3d('deflect', e.pos, { volume: 1, refDistance: 10 });
          if (e.player === me) this.hud.showBanner('DEFLECT!');
          break;
        case 'recallStart':
          a.play3d('recallTelegraph', e.from, { volume: 1, refDistance: 20 });
          if (e.player !== me && e.lethal) a.play('recallTelegraph', { volume: 0.5 });
          break;
        case 'recallGo':
          a.play3d('recallWhoosh', posOf(e.player), { volume: 0.9, refDistance: 10 });
          break;
        case 'slash':
          a.play3d('slash', posOf(e.player), { volume: 0.8 });
          if (e.player === me) this.slashed = true;
          break;
        case 'laserWarn':
          a.play3d('laserWarn', posOf(e.player), { volume: 0.9, refDistance: 12 });
          break;
        case 'laserFire':
          a.play3d('laserFire', e.from, { volume: 0.9, refDistance: 10 });
          break;
        case 'grenadeThrow':
          a.play3d('grenadeThrow', posOf(e.player), { volume: 0.7 });
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
        case 'hit':
          this.models.flash(e.victim);
          if (e.attacker === me && e.victim !== me) {
            const killed = !world.players.find((p) => p.id === e.victim)?.alive;
            this.hud.hitMarker(e.head, killed);
            if (!killed) a.play(e.head ? 'hitHead' : 'hitMarker', { volume: 0.9 });
          }
          if (e.victim === me) {
            a.play('hurt', { volume: 0.8 });
            c.shake = Math.max(c.shake, 0.35);
            // direction on screen (camera space)
            const cam = c.camera;
            const d = new THREE.Vector3(e.src.x, e.src.y, e.src.z).applyMatrix4(
              cam.matrixWorldInverse,
            );
            this.hud.damageFrom(Math.atan2(d.x, d.y));
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
              this.onMyKill(c, e.kind, e.throwId);
            }
          }
          if (e.victim === me) {
            c.shake = 0.8;
            this.hud.showCenter(`Eliminated by ${this.name(c, e.attacker)}`, 2.5, 'warn');
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
    // ACE: whole enemy team (2+) dead
    const me = c.session.local();
    const enemies = c.session.world().players.filter((p) => p.team !== me?.team);
    const ace = enemies.length >= 2 && enemies.every((p) => !p.alive);
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
    this.models.update(others, dt, this.time);
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
        eye: eyePos(p, cfg.movement),
        view: p.id === s.localId ? c.fps.quat : p.view,
      }));
    this.view.update(
      {
        boomerangs: booms,
        grenades: s.grenades(),
        teamOf: (id) => this.teamOf(c, id),
        windups,
        laserWarns,
        localId: s.localId,
        camPos: c.eye(),
        pullRadius: cfg.combat.grenadePullRadius,
      },
      dt,
    );

    // private throw preview (+ steering preview), teammates on the path turn it orange
    let pred = null;
    if (me && me.alive && myB && settings.throwPreview) {
      const heldView = { ...me, view: c.fps.quat };
      if (myB.phase === Phase.Held && me.aiming) {
        const curve =
          (c.deps.input.isHeld('right') ? 1 : 0) - (c.deps.input.isHeld('left') ? 1 : 0);
        pred = predictThrow(world, s.ctx, heldView, curve, 160);
      } else if (
        (myB.phase === Phase.Out || myB.phase === Phase.Return) &&
        myB.steerLeft > 0 &&
        c.deps.input.isHeld('alt')
      ) {
        pred = predictThrow(world, s.ctx, heldView, 0, 160, myB, true);
      }
    }
    this.view.setPreview(
      pred,
      settings.throwPreviewOpacity,
      !!pred && pred.teammatesOnPath.length > 0,
    );

    // zoom
    if (me && me.alive && me.windup > 0) c.fovOverride = cfg.combat.windupFov;
    else if (me && me.alive && me.aiming) c.fovOverride = cfg.combat.aimFov;
    else c.fovOverride = null;

    // viewmodel
    const vfov = c.camera.fov;
    this.viewmodel.resize(c.camera.aspect, vfov);
    if (me) {
      const fullTicks = Math.round(cfg.combat.windupSec * 60);
      this.viewmodel.update(
        {
          held: myB?.phase === Phase.Held,
          team: me.team,
          aiming: me.aiming,
          windup: Math.min(1, me.windup / fullTicks),
          windupFull: me.windup >= fullTicks,
          slashing: this.slashed,
          laserCharges: me.laserCharges,
          laserMax: cfg.combat.laserCharges,
          laserWarn: me.laserWarn > 0,
          moving: Math.min(1, len(projectOnPlane(me.vel, me.up)) / 9) * (me.grounded ? 1 : 0),
        },
        dt,
      );
      this.slashed = false;
      this.viewmodel.scene.visible = me.alive;
    }

    // threat indicators: enemy (or deflected) Boomerangs heading at me, incl. behind
    const threats: Threat[] = [];
    if (me && me.alive) {
      const eye = c.eye();
      for (const b of booms) {
        if (!isFlying(b) || b.controller === s.localId) continue;
        const rel = sub(eye, b.pos);
        const dist = len(rel);
        const speed = len(b.vel);
        if (speed < 1 || dist > 40) continue;
        const closing = dot(normalize(b.vel), normalize(rel));
        const tta = dist / speed;
        if (closing < 0.75 || tta > 1.5) continue;
        const d = new THREE.Vector3(b.pos.x, b.pos.y, b.pos.z).applyMatrix4(
          c.camera.matrixWorldInverse,
        );
        const mateThrow = this.teamOf(c, b.controller) === me.team;
        threats.push({
          dirCam: d.normalize(),
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
        if (len(sub(p, eye)) < 2.5) {
          const d = new THREE.Vector3(b.recallFrom.x, b.recallFrom.y, b.recallFrom.z).applyMatrix4(
            c.camera.matrixWorldInverse,
          );
          threats.push({ dirCam: d.normalize(), intensity: 1, color: '#ffffff' });
        }
      }
    }

    // 3D whistles: louder & higher as they close in
    const seen = new Set<number>();
    const a = c.deps.audio;
    if (a.unlocked) {
      const eye = c.eye();
      for (const b of booms) {
        if (!isFlying(b)) continue;
        seen.add(b.id);
        let h = this.whistles.get(b.id);
        if (!h) {
          h = a.loop3d('boomerangWhistle', b.pos, {
            volume: 0.9,
            refDistance: 8,
            maxDistance: 180,
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
      const marker =
        myB && myB.phase !== Phase.Held
          ? projectMarker(myB.pos, c.camera, window.innerWidth, window.innerHeight)
          : null;
      this.hud.update(
        dt,
        {
          hp: me.hp,
          maxHp: cfg.combat.maxHp,
          boomerang: status,
          boomerangDist: myB ? len(sub(myB.pos, me.pos)) : 0,
          laserCharges: me.laserCharges,
          laserMax: cfg.combat.laserCharges,
          laserRecharge01: 0,
          grenades: me.grenadesLeft,
          dashReady01: 1 - me.dashCd / Math.max(1, Math.round(cfg.movement.dashCooldownSec * 60)),
          steer01:
            myB && myB.phase !== Phase.Held
              ? myB.steerLeft / Math.max(1, Math.round(cfg.combat.steerSec * 60))
              : 0,
          windup01: Math.min(1, me.windup / fullTicks),
          windupFull: me.windup >= fullTicks,
          windupHold01: me.windupHeld / Math.max(1, Math.round(cfg.combat.windupHoldSec * 60)),
          alive: me.alive,
        },
        threats,
        marker,
      );
    }
    this.hud.setStats(this.statsText?.() ?? null);
  }

  dispose(c: GameClient): void {
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
