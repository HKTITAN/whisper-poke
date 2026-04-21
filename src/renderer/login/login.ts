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

function show(which: keyof typeof stages) {
  for (const k of Object.keys(stages) as (keyof typeof stages)[]) {
    stages[k].hidden = k !== which;
  }
}

function setStatus(m: string) { statusEl.textContent = m; }

(document.getElementById('start') as HTMLButtonElement).addEventListener('click', async () => {
  setStatus('Connecting…');
  show('phone');
  // Kick off the flow — main will send provide-* messages as gramjs needs input.
  const r = await window.loginAPI.start();
  if (!r.ok) setStatus(`Failed: ${r.error}`);
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
    setStatus('Signed in!');
    setTimeout(() => window.close(), 700);
  } else {
    setStatus(`Sign-in failed: ${r.error ?? 'unknown error'}`);
  }
});
