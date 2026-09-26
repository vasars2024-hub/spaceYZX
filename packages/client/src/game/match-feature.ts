// Match presentation: score/timer bar, round banners, Tower beams and dropped Controllers
// (3D), scoreboard (Tab) and the match results overlay. On-screen markers (Towers,
// Controllers, name tags, reveals) are drawn by WorldMarkers.
import * as THREE from 'three';
import type { SimEvent } from '@space-yz/shared';
import { GAME_NAME, TICK_DT, collapseRadius, yawToView, v3 } from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import type { MatchInfo, Session } from './session';
import { h } from '../ui/menus';
import { mutes } from '../net/mutes';
import { TEAM_COLOR, TEAM_HEX, towerRole, controllerAtHome } from './objectives';
import { setSidesSwapped } from '../render/team-palette';
import { SkyArenaView } from '../render/sky-arena';
import { effects } from '../render/effects';

const TEAM_NAME = ['CYAN', 'ORANGE'] as const;

const REASON_TEXT: Record<string, string> = {
  tower: 'Tower touched',
  elimination: 'Team eliminated',
  time: 'Time — more players alive / more health',
  draw: 'Draw',
  collapse: 'Overtime: more players alive / more health / nearer the middle',
  sky: 'Sky duel: more players alive / more health / nearer the middle',
  exploded: 'The bomb exploded',
  defused: 'The bomb was defused',
};

const fmtTime = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface TowerFx {
  team: 0 | 1; // map side (whose Tower it is depends on the half-time side swap)
  owner: 0 | 1;
  beam: THREE.Mesh;
  ring: THREE.Mesh;
  flash: number;
}

export class MatchFeature implements ClientFeature {
  root!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private scoreA!: HTMLSpanElement;
  private scoreB!: HTMLSpanElement;
  private center!: HTMLDivElement;
  private sub!: HTMLDivElement;
  private banner!: HTMLDivElement;
  private bannerSub!: HTMLDivElement;
  private bannerUntil = 0;
  /** the game's name, big, over the round result */
  private wordmark!: HTMLDivElement;
  private wordmarkUntil = 0;
  private board!: HTMLDivElement;
  private results!: HTMLDivElement;
  private boardHeld = false;
  private unsub: (() => void) | null = null;
  private group = new THREE.Group();
  private towers: TowerFx[] = [];
  /** overtime: the glowing edge of the safe zone while the ship collapses */
  private zone = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 72, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  private zoneWarn!: HTMLDivElement;
  /** bomb mode: plant / defuse progress while you hold G */
  private bombBar!: HTMLDivElement;
  private bombBarFill!: HTMLDivElement;
  private bombBarText!: HTMLDivElement;
  /** bomb mode: the bomb itself (dropped or planted) with a blinking light */
  private bombMesh = new THREE.Group();
  private bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2e44 }),
  );
  private nextBeep = 0;
  /** seconds you've been outside the zone (local estimate for the countdown) */
  private outsideFor = 0;
  private dropped: THREE.Mesh[] = [];
  private time = 0;
  private lastCountdown = -1;
  private lastBoard = -1;
  private last: MatchInfo | null = null;
  /** the sky duel overtime's arena, clouds and sky (drawn only while the camera is up there) */
  private sky: SkyArenaView | null = null;

  init(c: GameClient): void {
    const ui = c.deps.ui;
    this.scoreA = h('span', { class: 'mb-score', style: `color:${TEAM_COLOR[0]}` }, '0');
    this.scoreB = h('span', { class: 'mb-score', style: `color:${TEAM_COLOR[1]}` }, '0');
    this.center = h('div', { class: 'mb-center' });
    this.sub = h('div', { class: 'mb-sub' });
    this.bar = h(
      'div',
      { class: 'match-bar' },
      h('div', { class: 'mb-row' }, this.scoreA, this.center, this.scoreB),
      this.sub,
    );
    this.wordmark = h('div', { class: 'match-wordmark' }, GAME_NAME.toUpperCase());
    this.zoneWarn = h('div', { class: 'zone-warn' });
    this.bombBarFill = h('div', { class: 'bomb-bar-fill' });
    this.bombBarText = h('div', { class: 'bomb-bar-text' });
    this.bombBar = h(
      'div',
      { class: 'bomb-bar' },
      this.bombBarText,
      h('div', { class: 'bomb-bar-track' }, this.bombBarFill),
    );
    this.banner = h('div', { class: 'match-banner' });
    this.bannerSub = h('div', { class: 'match-banner-sub' });
    this.board = h('div', { class: 'scoreboard' });
    this.results = h('div', { class: 'match-results' });
    this.root = h(
      'div',
      { class: 'match-ui' },
      this.bar,
      h('div', { class: 'match-banner-wrap' }, this.wordmark, this.banner, this.bannerSub),
      this.zoneWarn,
      this.bombBar,
      this.board,
      this.results,
    );
    this.root.style.display = 'none';
    ui.append(this.root);
    this.unsub = c.deps.input.onAction((a) => {
      if (a === 'scoreboard') this.boardHeld = true;
      if (a === 'scoreboard:up') this.boardHeld = false;
    });
    // Tower beams (3D)
    for (const t of c.session.level.def.towers) {
      const color = TEAM_HEX[t.team];
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(t.radius * 0.9, t.radius * 0.9, 40, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      beam.position.set(t.pos.x, t.pos.y + 20, t.pos.z);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(t.radius + 1.6, t.radius + 2.2, 40),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(t.pos.x, t.pos.y + 0.03, t.pos.z);
      this.group.add(beam, ring);
      this.towers.push({ team: t.team, owner: t.team, beam, ring, flash: 0 });
    }
    for (const team of [0, 1] as const) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.35),
        new THREE.MeshBasicMaterial({ color: TEAM_HEX[team] }),
      );
      m.visible = false;
      this.dropped.push(m);
      this.group.add(m);
    }
    this.bombMesh.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.16, 0.3),
        new THREE.MeshBasicMaterial({ color: 0x2b303a }),
      ),
      new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.02, 0.14),
        new THREE.MeshBasicMaterial({ color: 0x7cff9a }),
      ).translateY(0.09),
    );
    this.bombLight.position.set(0.14, 0.11, 0);
    this.bombMesh.add(this.bombLight);
    this.bombMesh.visible = false;
    this.group.add(this.bombMesh);
    this.zone.visible = false;
    this.zone.renderOrder = 5;
    this.group.add(this.zone);
    c.scene.add(this.group);
    this.sky = new SkyArenaView(c.session.level.def, TEAM_HEX, effects.decoration);
    c.scene.add(this.sky.group);
  }

  private myTeam(s: Session): 0 | 1 {
    return s.local()?.team ?? 0;
  }

  private showBanner(text: string, sub = '', sec = 2.5, color = '#fff'): void {
    this.banner.textContent = text;
    this.banner.style.color = color;
    this.bannerSub.textContent = sub;
    this.bannerUntil = this.time + sec;
  }

  events(c: GameClient, events: SimEvent[]): void {
    const s = c.session;
    const a = c.deps.audio;
    const mine = this.myTeam(s);
    const names = s.names();
    const nameOf = (id: number) => (id === s.localId ? 'You' : (names[id] ?? `Player ${id}`));
    for (const e of events) {
      switch (e.type) {
        case 'roundStart': {
          // teams swap map sides at half time: say so, or people run to the wrong Tower
          const swapped = !!s.match?.()?.sideSwapped && this.last?.sideSwapped === false;
          this.showBanner(
            e.suddenDeath ? 'SUDDEN DEATH' : `ROUND ${e.round}`,
            e.suddenDeath
              ? 'Half timer · bigger Tower zones · everyone revealed'
              : swapped
                ? s.match?.()?.objective === 'bomb'
                  ? mine === s.match?.()?.attackers
                    ? 'Sides swapped — you are now T (orange): plant the bomb'
                    : 'Sides swapped — you are now CT (cyan): defend the sites'
                  : s.match?.()?.objective === 'elim'
                    ? 'Sides swapped · team colors swapped too'
                    : 'Sides swapped — attack the other Tower now · team colors swapped too'
                : 'Get ready',
            swapped ? 4 : 3,
            e.suddenDeath ? '#ff5b5b' : '#fff',
          );
          a.play('roundStart');
          break;
        }
        case 'bombPlanted':
          this.showBanner(
            `BOMB PLANTED AT ${e.site}`,
            this.myTeam(s) === this.last?.attackers ? 'Protect it' : 'Defuse it: hold G next to it',
            3,
            '#ff5a6a',
          );
          a.play('controllerPickup');
          break;
        case 'bombDefused':
          this.showBanner('BOMB DEFUSED', '', 3, '#19e3ff');
          break;
        case 'bombExploded':
          a.play('grenadePop', { volume: 1.2, rate: 0.55 });
          a.play('killWindup', { volume: 0.9, rate: 0.6 });
          c.shake = Math.max(c.shake, 1.2);
          break;
        case 'defuseStart':
          // attackers hear a defuse start (a ninja defuse is possible but risky)
          a.play('recallTelegraph', { volume: 0.6, rate: 1.4 });
          break;
        case 'bombDrop':
          if (this.myTeam(s) === this.last?.attackers)
            this.showBanner('BOMB DROPPED', 'Walk over it to pick it up', 2, '#ff8a1f');
          break;
        case 'overtime':
          if (e.kind === 'sky') {
            const secs = Math.round(s.config.rules.skyOvertimeSec);
            this.showBanner(
              `SKY DUEL — ${secs} s, don't fall`,
              'Jetpack sped up · fall off the platforms = eliminated',
              3.5,
              '#7fd6ff',
            );
            // you were teleported up to the arena: look at the other end (team 0 starts at -x)
            const me = s.local();
            if (me?.alive) c.fps.reset(yawToView(me.team === 0 ? -90 : 90), v3(0, 1, 0));
          } else
            this.showBanner(
              'OVERTIME',
              'The ship is breaking up: get to the middle. Outside the zone for 3 s = eliminated',
              3.5,
              '#ffe45c',
            );
          a.play('revealPulse');
          break;
        case 'roundLive':
          this.showBanner('GO!', '', 1);
          break;
        case 'roundEnd': {
          const won = e.winner === mine;
          const text = e.winner === null ? 'DRAW' : won ? 'ROUND WON' : 'ROUND LOST';
          this.showBanner(
            text,
            REASON_TEXT[e.reason] ?? e.reason,
            4,
            e.winner === null ? '#fff' : TEAM_COLOR[e.winner],
          );
          this.wordmarkUntil = this.time + 4;
          if (e.winner !== null) a.play(won ? 'roundWin' : 'roundLose');
          break;
        }
        case 'matchEnd':
          a.play(e.winner === mine ? 'roundWin' : 'roundLose');
          break;
        case 'controllerDrop':
          this.showBanner(
            e.team === mine ? 'YOUR CONTROLLER DROPPED' : 'ENEMY CONTROLLER DROPPED',
            e.team === mine ? 'Stand on it for half a second to pick it up' : '',
            2.2,
            TEAM_COLOR[e.team],
          );
          a.play('controllerDrop');
          break;
        case 'controllerPickup':
          this.showBanner(
            e.player === s.localId
              ? 'YOU HAVE THE CONTROLLER'
              : `${nameOf(e.player)} has the Controller`,
            e.player === s.localId ? 'Touch the enemy Tower to win the round' : '',
            2,
            TEAM_COLOR[e.team],
          );
          a.play('controllerPickup');
          break;
        case 'controllerReturn': {
          // the rules re-send "returned" every few seconds while it sits at base: only the
          // first one is news
          const prev = this.last?.controllers.find((x) => x.team === e.team);
          const wasHome =
            !!this.last &&
            !!prev?.droppedAt &&
            controllerAtHome(s.level.def, e.team, this.last.sideSwapped, prev.droppedAt);
          if (!wasHome) a.play('controllerReturn');
          break;
        }
        case 'towerTouch': {
          // the touched Tower belongs to the other team; towers are stored by map side
          const swapped = this.last?.sideSwapped ? 1 : 0;
          const side = (1 - e.team) ^ swapped;
          const fx = this.towers.find((t) => t.team === side);
          if (fx) fx.flash = 1.5;
          a.play('towerTouch');
          break;
        }
      }
    }
  }

  frame(c: GameClient, dt: number): void {
    this.time += dt;
    const s = c.session;
    this.sky?.update(c.scene, c.camera.position, this.time);
    const m = s.match?.() ?? null;
    this.last = m;
    setSidesSwapped(!!m?.sideSwapped);
    if (!m) {
      this.root.style.display = 'none';
      this.group.visible = false;
      c.panelOpen = false;
      return;
    }
    this.root.style.display = '';
    this.group.visible = true;
    const tick = s.tickNow?.() ?? s.world().tick;
    const mine = this.myTeam(s);
    const rules = s.config.rules;

    // ---- score bar ----
    this.scoreA.textContent = String(m.scores[0]);
    this.scoreB.textContent = String(m.scores[1]);
    this.scoreA.style.color = TEAM_COLOR[0];
    this.scoreB.style.color = TEAM_COLOR[1];
    for (const t of [0, 1] as const)
      (this.dropped[t].material as THREE.MeshBasicMaterial).color.setHex(TEAM_HEX[t]);
    let centerText = '';
    let subText = '';
    let urgent = false;
    switch (m.phase) {
      case 'warmup':
        centerText = m.startAt ? `Starting in ${Math.ceil((m.startAt - tick) / 60)}` : 'WARMUP';
        subText = m.startAt
          ? ''
          : `Waiting for players (${m.mode})${s.canStart?.() ? ' · Esc → Start match now' : ''}`;
        break;
      case 'spawnLock': {
        const left = Math.ceil((m.phaseEnds - tick) / 60);
        centerText = `ROUND ${m.round} · ${left}`;
        subText = m.suddenDeath ? 'SUDDEN DEATH' : `First to ${m.firstTo} · max ${m.maxRounds}`;
        if (left !== this.lastCountdown && left <= 3 && left > 0)
          c.deps.audio.play('countdownTick');
        this.lastCountdown = left;
        break;
      }
      case 'live': {
        const sec = (m.roundEnds - tick) / 60;
        centerText = fmtTime(sec);
        urgent = sec <= rules.lastSecondsRevealAll;
        subText = `Round ${m.round}`;
        if (m.objective === 'elim') subText = `Round ${m.round} · ELIMINATION · last team standing`;
        if (m.objective === 'bomb') {
          const iAttack = mine === m.attackers;
          const b = m.bomb;
          subText = iAttack
            ? b?.carrier === s.localId
              ? 'T SIDE · YOU HAVE THE BOMB · hold G in site A or B to plant'
              : 'T SIDE (orange) · ATTACK · plant the bomb at A or B'
            : 'CT SIDE (cyan) · DEFEND · stop the plant at A and B';
          if (b?.planted) {
            // the fuse replaces the round timer
            centerText = fmtTime((b.planted.explodeAt - tick) / 60);
            urgent = true;
            subText = iAttack
              ? `BOMB PLANTED AT ${b.planted.site} · protect it`
              : `BOMB PLANTED AT ${b.planted.site} · hold G next to it to defuse`;
          }
        }
        if (m.overtime) {
          centerText = fmtTime((m.overtime.ends - tick) / 60);
          urgent = true;
          subText =
            m.overtime.kind === 'sky'
              ? "SKY DUEL · don't fall · jetpack sped up"
              : 'OVERTIME · the ship is collapsing · get to the middle';
        }
        break;
      }
      case 'roundEnd':
        centerText = `ROUND ${m.round}`;
        subText = 'Next round soon';
        break;
      case 'matchEnd':
        centerText = 'MATCH OVER';
        break;
    }
    // (in the sky duel the Tower is out of reach: no Controller talk)
    const skyDuel = m.phase === 'live' && m.overtime?.kind === 'sky';
    if (skyDuel) {
      // keep the sky duel line
    } else if (m.carriers.includes(s.localId) && m.phase === 'live')
      subText = 'You carry the Controller — touch the enemy Tower';
    else if (m.phase === 'live' && m.carriers.length > 0) {
      // who has which Controller, for both teams
      const names = s.names();
      const who = (id: number) => names[id] ?? `Player ${id}`;
      const teamOf = (id: number) =>
        s.world().players.find((p) => p.id === id)?.team ?? s.teams?.()[id];
      const parts = m.carriers.map((id) =>
        teamOf(id) === mine
          ? `◆ ${who(id)} has YOUR Controller`
          : `◆ ${who(id)} (enemy) has theirs`,
      );
      subText = parts.join('   ·   ');
    }
    this.center.textContent = centerText;
    this.center.classList.toggle('urgent', urgent);
    this.sub.textContent = subText;
    this.bar.dataset.team = String(mine);

    // ---- banner ----
    const bannerOn = this.time < this.bannerUntil;
    this.banner.style.opacity = bannerOn ? '1' : '0';
    this.bannerSub.style.opacity = bannerOn ? '1' : '0';
    this.wordmark.classList.toggle('show', this.time < this.wordmarkUntil);

    // ---- overtime: the safe zone's edge + the out-of-zone countdown ----
    // (the sky duel has no zone: its edge is the platform's)
    const ot = m.phase === 'live' && m.overtime?.kind === 'collapse' ? m.overtime : null;
    this.zone.visible = !!ot;
    let outside = false;
    if (ot) {
      const radius = collapseRadius(ot, tick, { config: s.config, dt: TICK_DT });
      this.zone.position.set(ot.center.x, ot.center.y + 10, ot.center.z);
      this.zone.scale.set(radius, 60, radius);
      (this.zone.material as THREE.MeshBasicMaterial).opacity =
        0.16 + 0.08 * Math.sin(this.time * 4);
      const me = s.local();
      outside =
        !!me && me.alive && Math.hypot(me.pos.x - ot.center.x, me.pos.z - ot.center.z) > radius;
    }
    this.outsideFor = outside ? this.outsideFor + dt : 0;
    this.zoneWarn.classList.toggle('show', outside);
    if (outside) {
      const left = Math.max(0, rules.collapseOutsideSec - this.outsideFor);
      this.zoneWarn.textContent = `OUT OF THE ZONE · ${left.toFixed(1)} s · get to the middle`;
    }

    // ---- bomb mode: the bomb, its beeps, your plant / defuse progress ----
    const bomb = m.objective === 'bomb' && m.phase === 'live' ? m.bomb : null;
    this.bombMesh.visible = !!bomb && bomb.carrier === null;
    if (bomb) {
      this.bombMesh.position.set(bomb.pos.x, bomb.pos.y - 0.82, bomb.pos.z);
      let blink = 0.8;
      if (bomb.planted) {
        // beeps speed up as the fuse runs out
        const left = Math.max(0, (bomb.planted.explodeAt - tick) / 60);
        const every = Math.max(0.12, Math.min(1, left / 30));
        if (this.time >= this.nextBeep) {
          c.deps.audio.play3d('countdownTick', bomb.pos, {
            volume: 0.9,
            refDistance: 10,
            maxDistance: 70,
          });
          this.nextBeep = this.time + every;
        }
        blink = this.nextBeep - this.time > every * 0.5 ? 1 : 0;
      }
      this.bombLight.visible = blink > 0.5;
      const prog = bomb.plant ?? bomb.defuse;
      const mineProg = prog && prog.player === s.localId;
      this.bombBar.classList.toggle('show', !!mineProg);
      if (mineProg && prog) {
        const planting = !!bomb.plant;
        const need = (planting ? rules.bombPlantSec : rules.bombDefuseSec) * 60;
        const u = Math.min(1, prog.ticks / need);
        this.bombBarFill.style.width = `${u * 100}%`;
        this.bombBarText.textContent = `${planting ? 'PLANTING' : 'DEFUSING'} · ${((need - prog.ticks) / 60).toFixed(1)} s`;
      }
    } else this.bombBar.classList.remove('show');

    // ---- 3D: towers + dropped Controllers (Tower mode only) ----
    for (const fx of this.towers) {
      fx.beam.visible = m.objective === 'tower';
      fx.ring.visible = m.objective === 'tower';
      fx.flash = Math.max(0, fx.flash - dt);
      const pulse = fx.flash > 0 ? 0.5 + 0.5 * Math.sin(this.time * 30) : 0;
      const beam = fx.beam.material as THREE.MeshBasicMaterial;
      beam.opacity = 0.1 + pulse * 0.6;
      const sd = m.suddenDeath ? rules.suddenDeathTowerScale : 1;
      fx.ring.scale.setScalar(sd);
      // after the half-time swap the beam shows its new owner (same color as its marker)
      const { owner } = towerRole(fx.team, m.sideSwapped, mine);
      if (owner !== fx.owner) {
        fx.owner = owner;
        beam.color.setHex(TEAM_HEX[owner]);
        (fx.ring.material as THREE.MeshBasicMaterial).color.setHex(TEAM_HEX[owner]);
      }
    }
    for (const ctl of m.controllers) {
      const mesh = this.dropped[ctl.team];
      mesh.visible = !!ctl.droppedAt && m.phase === 'live';
      if (ctl.droppedAt) {
        mesh.position.set(
          ctl.droppedAt.x,
          ctl.droppedAt.y + 0.3 * Math.sin(this.time * 3),
          ctl.droppedAt.z,
        );
        mesh.rotation.y = this.time * 2;
      }
    }

    // ---- scoreboard & results ----
    const showBoard = this.boardHeld || m.phase === 'roundEnd';
    const refresh = this.time - this.lastBoard > 0.25;
    this.board.style.display = showBoard && m.phase !== 'matchEnd' ? '' : 'none';
    this.results.style.display = m.phase === 'matchEnd' ? '' : 'none';
    // name tags and markers would show through the (see-through) panels
    c.panelOpen = showBoard || m.phase === 'matchEnd';
    if (refresh) {
      this.lastBoard = this.time;
      if (showBoard) this.board.replaceChildren(this.scoreboard(s, m, false));
      if (m.phase === 'matchEnd') this.results.replaceChildren(this.resultsView(s, m, tick));
    }
  }

  /** Scoreboard table (also used in the pause menu with report buttons). */
  scoreboard(s: Session, m: MatchInfo, interactive: boolean): HTMLElement {
    const names = s.names();
    const pings = s.pings?.() ?? {};
    const stats = new Map(m.stats.map((x) => [x.id, x]));
    const cols = (team: 0 | 1) => {
      // from the server's match stats: includes players hidden by line-of-sight culling
      const rows = m.stats
        .filter((p) => p.team === team)
        .map((p) => {
          const st = stats.get(p.id);
          const me = p.id === s.localId;
          return h(
            'tr',
            { class: me ? 'me' : '' },
            h(
              'td',
              {},
              `${m.carriers.includes(p.id) ? '◆ ' : ''}${me ? 'You' : (names[p.id] ?? `Player ${p.id}`)}${mutes.has(p.id) ? ' 🔇' : ''}`,
            ),
            h('td', {}, String(st?.kills ?? 0)),
            h('td', {}, String(st?.deaths ?? 0)),
            h('td', {}, String(st?.teamKills ?? 0)),
            h('td', {}, String(st?.damage ?? 0)),
            h('td', {}, pings[p.id] ? `${pings[p.id]} ms` : '—'),
            interactive && !me && (s.report || mutes.canMute(p.id))
              ? h(
                  'td',
                  { class: 'sb-actions' },
                  // mute (text chat + voice) for other humans online
                  mutes.canMute(p.id)
                    ? (() => {
                        const label = () => (mutes.has(p.id) ? 'Unmute' : 'Mute');
                        const b = h('button', { class: 'btn tiny secondary' }, label());
                        b.addEventListener('click', () => {
                          mutes.toggle(p.id);
                          b.textContent = label();
                        });
                        return b;
                      })()
                    : null,
                  (() => {
                    const b = h('button', { class: 'btn tiny secondary' }, 'Report');
                    b.addEventListener('click', () => {
                      s.report?.(p.id, 'reported from scoreboard');
                      b.textContent = 'Reported';
                      b.disabled = true;
                    });
                    return b;
                  })(),
                )
              : h('td', {}),
          );
        });
      return h(
        'div',
        { class: 'sb-team' },
        h(
          'div',
          { class: 'sb-title', style: `color:${TEAM_COLOR[team]}` },
          `${TEAM_NAME[team]} · ${m.scores[team]}`,
        ),
        h(
          'table',
          {},
          h('tr', {}, ...['Player', 'K', 'D', 'TK', 'Dmg', 'Ping', ''].map((x) => h('th', {}, x))),
          ...rows,
        ),
      );
    };
    const history = h(
      'div',
      { class: 'sb-rounds' },
      ...m.rounds.map((r, i) =>
        h(
          'span',
          {
            class: 'sb-round',
            title: `Round ${i + 1}: ${REASON_TEXT[r.reason] ?? r.reason}`,
            style: `background:${r.winner === null ? '#555' : TEAM_COLOR[r.winner]}`,
          },
          r.reason === 'tower'
            ? 'T'
            : r.reason === 'elimination'
              ? 'E'
              : r.reason === 'time'
                ? '⏱'
                : r.reason === 'sky'
                  ? '☁'
                  : '=',
        ),
      ),
    );
    return h('div', { class: 'sb' }, history, h('div', { class: 'sb-cols' }, cols(0), cols(1)));
  }

  private resultsView(s: Session, m: MatchInfo, tick: number): HTMLElement {
    const mine = this.myTeam(s);
    const title = m.winner === null ? 'DRAW' : m.winner === mine ? 'VICTORY' : 'DEFEAT';
    const color = m.winner === null ? '#fff' : TEAM_COLOR[m.winner];
    const left = Math.max(0, Math.ceil((m.phaseEnds - tick) / 60));
    return h(
      'div',
      { class: 'mr' },
      h('div', { class: 'mr-title', style: `color:${color}` }, title),
      h(
        'div',
        { class: 'mr-score' },
        h('span', { style: `color:${TEAM_COLOR[0]}` }, String(m.scores[0])),
        ' – ',
        h('span', { style: `color:${TEAM_COLOR[1]}` }, String(m.scores[1])),
      ),
      h('div', { class: 'mr-reason' }, m.endReason),
      this.scoreboard(s, m, false),
      h('div', { class: 'mr-next' }, `Back to warmup in ${left} s · Esc for menu`),
    );
  }

  /** Latest match info (for the pause menu). */
  current(): MatchInfo | null {
    return this.last;
  }

  dispose(c: GameClient): void {
    this.unsub?.();
    setSidesSwapped(false);
    this.sky?.dispose(c.scene);
    this.sky = null;
    this.root.remove();
    c.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
