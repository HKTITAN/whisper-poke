import * as keytar from 'keytar';

const SERVICE = 'WhisperPoke';
const ACCOUNT = 'telegram-session';

export async function loadSession(): Promise<string> {
  const s = await keytar.getPassword(SERVICE, ACCOUNT);
  return s ?? '';
}

export async function saveSession(session: string): Promise<void> {
  await keytar.setPassword(SERVICE, ACCOUNT, session);
}

export async function clearSession(): Promise<void> {
  await keytar.deletePassword(SERVICE, ACCOUNT);
}
