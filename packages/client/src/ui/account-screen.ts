// The account screen. Guests: secure the account (username + password; everything played so
// far stays), log in to an account, recover a password with the recovery code, or use the old
// login code. Secured accounts: change password, new recovery code, log out (here / everywhere).
// Passwords go straight to the server over the game connection (WSS in production) and are
// never stored in the browser.
import type { NetCore } from '@space-yz/shared';
import { PASSWORD_MIN, USERNAME_MAX, checkUsername, passwordProblem } from '@space-yz/shared';
import { h, button } from './menus';
import { screenHead, segTabs } from './menu-kit';
import { avatarEl } from './avatars';
import { account, type AccountResult } from '../net/account';

const input = (type: 'text' | 'password', placeholder: string, auto: string): HTMLInputElement =>
  h('input', {
    type,
    placeholder,
    autocomplete: auto,
    'aria-label': placeholder,
    spellcheck: 'false',
    autocapitalize: 'off',
    maxlength: type === 'text' ? '40' : '128',
  });

/** A form's submit button (Enter in a field submits too). */
const submitBtn = (label: string, cls: string): HTMLButtonElement =>
  h('button', { class: cls, type: 'submit' }, label);

const status = (): HTMLDivElement => h('div', { class: 'queue-status' });
const say = (el: HTMLElement, text: string, kind: 'ok' | 'error' | '' = ''): void => {
  el.textContent = text;
  el.className = `queue-status${kind === 'ok' ? ' active' : kind === 'error' ? ' error' : ''}`;
};

/** The one-time recovery code, with a copy button. */
export const recoveryCodeScreen = (code: string, done: () => void): HTMLElement => {
  const copied = status();
  return h(
    'div',
    { class: 'screen interactive flow-screen' },
    screenHead('key', 'Your recovery code', null),
    h(
      'div',
      { class: 'panel account-panel' },
      h(
        'p',
        {},
        'Save this code somewhere safe (a password manager, or write it down). It is the only way back into your account if you forget your password — there is no e-mail reset yet. It is shown only now, and works once (you get a new one when you use it).',
      ),
      h('div', { class: 'recovery-code' }, code),
      h(
        'div',
        { class: 'choice-row' },
        button('Copy', () => {
          void navigator.clipboard?.writeText(code).then(
            () => say(copied, 'Copied.', 'ok'),
            () => say(copied, 'Copy failed: select the code and copy it by hand.', 'error'),
          );
        }),
        button('I saved it', done, 'btn primary'),
      ),
      copied,
    ),
  );
};

export interface AccountScreenOpts {
  core: NetCore;
  back: () => void;
  /** show a recovery code (after securing / recovering / renewing) */
  showCode: (code: string) => void;
  /** use an old-style login code (guests moving to another PC) */
  useLoginCode: (code: string) => void;
}

type GuestTab = 'secure' | 'login' | 'recover';

export const accountScreen = (o: AccountScreenOpts): HTMLElement => {
  const body = h('div', { class: 'panel account-panel' });
  let tab: GuestTab = 'secure';
  /** the op whose answer we wait for, and where to say it */
  let pending: { op: string; out: HTMLElement } | null = null;

  const send = (
    out: HTMLElement,
    op: 'register' | 'login' | 'recover' | 'password' | 'recoveryCode' | 'logout' | 'logoutAll',
    fields: Parameters<typeof account.account>[1] = {},
  ) => {
    if (o.core.state === 'room') return say(out, 'Leave your room first.', 'error');
    if (o.core.state !== 'lobby') return say(out, 'Not connected to the game server.', 'error');
    pending = { op, out };
    say(out, 'One moment…');
    account.account(op, fields);
  };

  const off = account.onResult((r) => {
    if (!body.isConnected) return off();
    if (r.t !== 'accountResult') return;
    const p = pending;
    if (!p || (r.op !== p.op && !(r.op === 'logout' && p.op === 'logoutAll'))) {
      // logged out from another device while this screen is open
      if (r.op === 'logout') render();
      return;
    }
    pending = null;
    const res = r as AccountResult;
    if (!res.ok) return say(p.out, res.error ?? 'That did not work.', 'error');
    if (res.recoveryCode) return o.showCode(res.recoveryCode);
    say(p.out, 'Done.', 'ok');
    render();
  });
  // re-draw when the account itself changes (logged in / out, secured), not on every friends
  // list update (that would wipe what the player is typing)
  const who = () => {
    const m = account.me;
    return m ? `${m.id}/${m.secured}/${m.name}/${m.avatar}/${m.banner}` : '';
  };
  let shown = '';
  const offMe = account.onChange(() => {
    if (!body.isConnected) return offMe();
    if (!pending && who() !== shown) render();
  });

  const guestForms = (): HTMLElement[] => {
    const out = status();
    const user = input('text', 'Username', 'username');
    const pass = input(
      'password',
      'Password',
      tab === 'login' ? 'current-password' : 'new-password',
    );
    const pass2 = input('password', 'Repeat the password', 'new-password');
    const code = input('text', 'Recovery code', 'off');
    let form: HTMLElement;
    if (tab === 'secure') {
      user.value = account.me?.name ?? '';
      form = h(
        'form',
        { class: 'account-form' },
        h(
          'p',
          {},
          `Pick a username (3–${USERNAME_MAX} characters) and a password (${PASSWORD_MIN}+). Your ratings, matches and best times stay: it is the same account. Then you can log in on any device.`,
        ),
        user,
        pass,
        pass2,
        submitBtn('Secure my account', 'btn primary'),
        out,
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const u = checkUsername(user.value);
        if (!u.ok) return say(out, u.error, 'error');
        const bad = passwordProblem(pass.value);
        if (bad) return say(out, bad, 'error');
        if (pass.value !== pass2.value) return say(out, 'The passwords are different.', 'error');
        send(out, 'register', { username: u.name, password: pass.value });
        pass.value = pass2.value = '';
      });
    } else if (tab === 'login') {
      form = h(
        'form',
        { class: 'account-form' },
        h(
          'p',
          {},
          'Log in to your account on this device. (This guest stays on this device: logging out comes back to it.)',
        ),
        user,
        pass,
        submitBtn('Log in', 'btn primary'),
        out,
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!user.value.trim() || !pass.value)
          return say(out, 'Enter your username and password.', 'error');
        send(out, 'login', { username: user.value.trim(), password: pass.value });
        pass.value = '';
      });
    } else {
      pass.placeholder = 'New password';
      form = h(
        'form',
        { class: 'account-form' },
        h(
          'p',
          {},
          'Forgot your password? Your username and the recovery code you saved set a new one.',
        ),
        user,
        code,
        pass,
        pass2,
        submitBtn('Set new password', 'btn primary'),
        out,
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const bad = passwordProblem(pass.value);
        if (bad) return say(out, bad, 'error');
        if (pass.value !== pass2.value) return say(out, 'The passwords are different.', 'error');
        send(out, 'recover', {
          username: user.value.trim(),
          code: code.value.trim(),
          password: pass.value,
        });
        pass.value = pass2.value = '';
      });
    }
    // the old login code: a guest moving to another PC without securing the account
    const codeOut = h('input', {
      type: 'password',
      readonly: 'readonly',
      value: o.core.token ?? '',
      class: 'login-code',
      'aria-label': 'Your login code',
    });
    const codeIn = h('input', {
      type: 'text',
      placeholder: 'Paste a login code',
      class: 'login-code',
      'aria-label': 'Login code',
    });
    return [
      segTabs<GuestTab>(
        [
          { id: 'secure', label: 'Secure account', icon: 'key' },
          { id: 'login', label: 'Log in', icon: 'profile' },
          { id: 'recover', label: 'Forgot password', icon: 'respawn' },
        ],
        tab,
        (t) => {
          tab = t;
          render();
        },
      ),
      form,
      h(
        'details',
        { class: 'login-code-box' },
        h('summary', {}, 'Guest login code (old way to move a guest to another PC)'),
        h(
          'div',
          { class: 'choice-row' },
          codeOut,
          button(
            'Copy',
            () => void navigator.clipboard?.writeText(o.core.token ?? ''),
            'btn small',
          ),
        ),
        h(
          'div',
          { class: 'choice-row' },
          codeIn,
          button(
            'Use this code',
            () => {
              const c = codeIn.value.trim();
              if (/^syz_[A-Za-z0-9_-]{20,64}$/.test(c)) o.useLoginCode(c);
              else codeIn.value = '';
            },
            'btn small orange',
          ),
        ),
      ),
    ];
  };

  const securedForms = (): HTMLElement[] => {
    const outPw = status();
    const old = input('password', 'Current password', 'current-password');
    const pw = input('password', 'New password', 'new-password');
    const pw2 = input('password', 'Repeat the new password', 'new-password');
    const change = h(
      'form',
      { class: 'account-form' },
      h('div', { class: 'label' }, 'Change password'),
      old,
      pw,
      pw2,
      submitBtn('Change password', 'btn'),
      h('div', { class: 'muted small' }, 'Every other device is logged out.'),
      outPw,
    );
    change.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = passwordProblem(pw.value);
      if (bad) return say(outPw, bad, 'error');
      if (pw.value !== pw2.value) return say(outPw, 'The passwords are different.', 'error');
      send(outPw, 'password', { oldPassword: old.value, password: pw.value });
      old.value = pw.value = pw2.value = '';
    });
    const outCode = status();
    const cpw = input('password', 'Password', 'current-password');
    const renew = h(
      'form',
      { class: 'account-form' },
      h('div', { class: 'label' }, 'Recovery code'),
      h('div', { class: 'muted small' }, 'Lost it? Make a new one (the old one stops working).'),
      cpw,
      submitBtn('New recovery code', 'btn secondary'),
      outCode,
    );
    renew.addEventListener('submit', (e) => {
      e.preventDefault();
      send(outCode, 'recoveryCode', { password: cpw.value });
      cpw.value = '';
    });
    const outOut = status();
    return [
      change,
      renew,
      h(
        'div',
        { class: 'account-form' },
        h('div', { class: 'label' }, 'Log out'),
        h(
          'div',
          { class: 'choice-row' },
          button('Log out', () => send(outOut, 'logout'), 'btn orange'),
          button(
            'Log out everywhere',
            () => {
              if (confirm('Log out on every device (this one too)?')) send(outOut, 'logoutAll');
            },
            'btn secondary',
          ),
        ),
        outOut,
      ),
    ];
  };

  const render = () => {
    const me = account.me;
    shown = who();
    const head = h(
      'div',
      { class: 'account-head' },
      me ? avatarEl(me.avatar, me.banner, 48) : null,
      h(
        'div',
        {},
        h('div', { class: 'profile-name' }, me?.name ?? o.core.name ?? 'Guest'),
        h(
          'div',
          { class: 'muted' },
          o.core.state === 'closed' || o.core.state === 'connecting'
            ? 'Connecting to the game server…'
            : me?.secured
              ? 'Secured account — log in anywhere with this username.'
              : 'Guest account on this device. Secure it to keep it safe and play on other devices.',
        ),
      ),
    );
    body.replaceChildren(head, ...(me?.secured ? securedForms() : guestForms()));
  };
  render();

  return h(
    'div',
    { class: 'screen interactive flow-screen account-flow' },
    screenHead('key', 'Account', () => {
      off();
      offMe();
      o.back();
    }),
    body,
  );
};
