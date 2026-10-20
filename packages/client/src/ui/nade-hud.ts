// HUD for the charged Gravity Grenade and the remote mine (both kits): the kit rows (grenade +
// bounce count, mine ready / placed / used), the charge bar under the crosshair while Q is
// held, and short hints when a mine can't be placed.
import { h } from './menus';

export interface UtilityStatus {
  /** the kit has the grenade */
  grenadeOn: boolean;
  grenades: number;
  /** 0..1 while holding Q (null = not charging) */
  charge01: number | null;
  /** throw speed if let go now, 0..1 of full (a tap is grenadeMinCharge) */
  strength: number;
  bounces: number;
  /** the remote mine: switched off in this mode, still to place, lying somewhere, gone, jammed */
  mine: 'off' | 'ready' | 'placed' | 'used' | 'jammed';
  /** your placed mine is armed (can be set off) */
  mineArmed: boolean;
  /** how far away your placed mine is (m) */
  mineDist: number | null;
  /** key names as bound */
  keys: { nade: string; bounce: string; place: string; detonate: string };
}

/** The kit rows (added under the weapons in the bottom-right kit list). */
export const utilityRows = (u: UtilityStatus): HTMLElement[] => {
  const rows: HTMLElement[] = [];
  if (u.grenadeOn)
    rows.push(
      h(
        'div',
        { class: 'kit-row' },
        `${u.keys.nade} GRENADE ${u.grenades > 0 ? '◆' : '◇'} · ${u.keys.bounce} ${u.bounces} BOUNCE${u.bounces === 1 ? '' : 'S'}`,
      ),
    );
  if (u.mine !== 'off') {
    const text =
      u.mine === 'ready'
        ? `${u.keys.place} MINE READY`
        : u.mine === 'placed'
          ? u.mineArmed
            ? `${u.keys.detonate} DETONATE MINE${u.mineDist !== null ? ` · ${Math.round(u.mineDist)} m` : ''}`
            : 'MINE ARMING…'
          : u.mine === 'jammed'
            ? 'MINE JAMMED (bomb planted)'
            : 'MINE USED';
    rows.push(
      h(
        'div',
        {
          class: `kit-row ${u.mine === 'placed' && u.mineArmed ? 'active' : ''}`,
          style: u.mine === 'used' || u.mine === 'jammed' ? 'opacity:0.55' : '',
        },
        text,
      ),
    );
  }
  return rows;
};

const REFUSED: Record<'air' | 'tower' | 'jammed', string> = {
  air: 'Stand on the ground to place your mine',
  tower: "Can't place a mine on the Tower",
  jammed: 'Mines are jammed: the bomb is planted',
};

/** Charge bar under the crosshair + the mine hints. */
export class NadeHud {
  private bar: HTMLDivElement;
  private fill: HTMLDivElement;
  private label: HTMLDivElement;
  private hint: HTMLDivElement;
  private hintTimer = 0;

  constructor(parent: HTMLElement) {
    this.fill = h('div', {
      style:
        'height:100%;width:0%;background:linear-gradient(90deg,#a46bff,#e2c8ff);border-radius:2px;',
    });
    this.label = h('div', {
      style:
        'margin-top:3px;font:700 11px Segoe UI,sans-serif;letter-spacing:0.12em;color:#e2c8ff;' +
        'text-shadow:0 0 4px #000;text-align:center;',
    });
    this.bar = h(
      'div',
      {
        style:
          'position:absolute;left:50%;top:calc(50% + 46px);transform:translateX(-50%);width:120px;' +
          'pointer-events:none;display:none;',
      },
      h(
        'div',
        {
          style:
            'height:6px;background:rgba(255,255,255,0.12);border:1px solid rgba(226,200,255,0.5);' +
            'border-radius:3px;overflow:hidden;',
        },
        this.fill,
      ),
      this.label,
    );
    this.hint = h('div', {
      style:
        'position:absolute;left:50%;top:calc(50% + 90px);transform:translateX(-50%);' +
        'pointer-events:none;display:none;font:700 14px Segoe UI,sans-serif;color:#ff8a1f;' +
        'letter-spacing:0.06em;text-shadow:0 0 6px #000;white-space:nowrap;',
    });
    parent.append(this.bar, this.hint);
  }

  /** A mine placement was refused: say why for a moment. */
  refused(reason: 'air' | 'tower' | 'jammed'): void {
    this.hint.textContent = REFUSED[reason];
    this.hint.style.display = '';
    this.hintTimer = 2;
  }

  update(dt: number, u: UtilityStatus | null): void {
    if (this.hintTimer > 0 && (this.hintTimer -= dt) <= 0) this.hint.style.display = 'none';
    const c = u?.charge01 ?? null;
    this.bar.style.display = c === null ? 'none' : '';
    if (c === null || !u) return;
    this.fill.style.width = `${Math.round(c * 100)}%`;
    this.label.textContent = `${Math.round(u.strength * 100)}% · ${u.bounces} BOUNCE${u.bounces === 1 ? '' : 'S'}`;
  }
}
