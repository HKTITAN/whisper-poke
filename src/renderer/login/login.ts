declare global {
  interface Window {
    loginAPI: {
      start: () => Promise<{ ok: boolean; error?: string }>;
      submit: (kind: 'phone' | 'code' | 'password', value: string) => void;
      onAskPhone: (cb: () => void) => void;
      onAskCode: (cb: () => void) => void;
      onAskPassword: (cb: () => void) => void;
      onStatus: (cb: (m: string) => void) => void;
      onDone: (cb: (r: { ok: boolean; error?: string }) => void) => void;
    };
  }
}

const stages = {
  idle: document.getElementById('stage-idle')!,
  phone: document.getElementById('stage-phone')!,
  code: document.getElementById('stage-code')!,
  password: document.getElementById('stage-password')!,
};
const statusEl = document.getElementById('status') as HTMLElement;
const stepsEl = document.getElementById('lg-steps') as HTMLElement;

const STEP_ORDER: Array<'phone' | 'code' | 'password'> = ['phone', 'code', 'password'];

function show(which: keyof typeof stages) {
  for (const k of Object.keys(stages) as (keyof typeof stages)[]) {
    stages[k].hidden = k !== which;
  }
  if (which === 'idle') {
    updateSteps('phone', false);
  } else {
    updateSteps(which, false);
  }
}

function updateSteps(current: 'phone' | 'code' | 'password', allDone: boolean) {
  const currentIdx = STEP_ORDER.indexOf(current);
  stepsEl.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
    const step = li.dataset.step as 'phone' | 'code' | 'password';
    const idx = STEP_ORDER.indexOf(step);
    li.classList.remove('active', 'done');
    if (allDone) li.classList.add('done');
    else if (idx < currentIdx) li.classList.add('done');
    else if (idx === currentIdx) li.classList.add('active');
  });
}

function setStatus(m: string, kind: '' | 'error' | 'ok' = '') {
  statusEl.textContent = m;
  statusEl.className = 'lg-status' + (kind ? ' ' + kind : '');
}

(document.getElementById('start') as HTMLButtonElement).addEventListener('click', async () => {
  setStatus('Connecting…');
  show('phone');
  // Kick off the flow — main will send provide-* messages as gramjs needs input.
  const r = await window.loginAPI.start();
  if (!r.ok) setStatus(`Failed: ${r.error}`, 'error');
});

(document.getElementById('phone-submit') as HTMLButtonElement).addEventListener('click', () => {
  const v = (document.getElementById('phone') as HTMLInputElement).value.trim();
  if (!v) return;
  window.loginAPI.submit('phone', v);
  setStatus('Sending code…');
});

(document.getElementById('code-submit') as HTMLButtonElement).addEventListener('click', () => {
  const v = (document.getElementById('code') as HTMLInputElement).value.trim();
  if (!v) return;
  window.loginAPI.submit('code', v);
  setStatus('Verifying…');
});

(document.getElementById('password-submit') as HTMLButtonElement).addEventListener('click', () => {
  const v = (document.getElementById('password') as HTMLInputElement).value;
  if (!v) return;
  window.loginAPI.submit('password', v);
  setStatus('Verifying 2FA…');
});

window.loginAPI.onAskPhone(() => { show('phone'); setStatus('Enter your phone number.'); });
window.loginAPI.onAskCode(() => { show('code'); setStatus('Enter the code Telegram sent you.'); });
window.loginAPI.onAskPassword(() => { show('password'); setStatus('Two-factor password required.'); });
window.loginAPI.onStatus((m) => setStatus(m));
window.loginAPI.onDone((r) => {
  if (r.ok) {
    updateSteps('password', true);
    setStatus('Signed in ✓', 'ok');
    setTimeout(() => window.close(), 700);
  } else {
    setStatus(`Sign-in failed: ${r.error ?? 'unknown error'}`, 'error');
  }
});
