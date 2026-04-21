import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { CustomFile } from 'telegram/client/uploads';
import { loadSession, saveSession, clearSession } from './session-store';

const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || '';
const BOT_USERNAME = process.env.POKE_BOT_USERNAME || 'interaction_poke_bot';

if (!API_ID || !API_HASH) {
  // Fatal config error — surfaced in main on first use.
  console.warn('[telegram] Missing TELEGRAM_API_ID / TELEGRAM_API_HASH in env');
}

// Resolvers the interactive login flow provides via LoginCallbacks.
export interface LoginCallbacks {
  phone: () => Promise<string>;
  code: () => Promise<string>;
  // Optional — invoked only if the account has 2FA enabled.
  password?: () => Promise<string>;
  onError?: (err: Error) => void;
}

class TelegramService {
  private client: TelegramClient | null = null;
  private session = new StringSession('');
  private connecting: Promise<void> | null = null;

  async init(): Promise<boolean> {
    const saved = await loadSession();
    this.session = new StringSession(saved);
    if (!saved) return false;
    try {
      await this.ensureConnected();
      const me = await this.client!.getMe();
      return !!me;
    } catch (e) {
      console.error('[telegram] saved session invalid:', e);
      await clearSession();
      this.session = new StringSession('');
      this.client = null;
      return false;
    }
  }

  async getUserInfo(): Promise<{
    id?: string;
    name: string;
    username?: string;
    phone?: string;
    premium?: boolean;
  } | null> {
    if (!this.client) return null;
    try {
      const me = (await this.client.getMe()) as unknown as {
        id?: { toString?: () => string } | string | number;
        firstName?: string; lastName?: string; username?: string; phone?: string;
        premium?: boolean;
      };
      const name = [me.firstName, me.lastName].filter(Boolean).join(' ') || 'Telegram user';
      const id = me.id && typeof (me.id as { toString?: () => string }).toString === 'function'
        ? (me.id as { toString: () => string }).toString()
        : me.id != null ? String(me.id) : undefined;
      return { id, name, username: me.username, phone: me.phone, premium: me.premium };
    } catch {
      return null;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.client && this.client.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      this.client = new TelegramClient(this.session, API_ID, API_HASH, {
        connectionRetries: 3,
        useWSS: false,
      });
      await this.client.connect();
    })();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async login(cb: LoginCallbacks): Promise<void> {
    await this.ensureConnected();
    await this.client!.start({
      phoneNumber: cb.phone,
      phoneCode: cb.code,
      password: cb.password ?? (async () => ''),
      onError: (err) => {
        cb.onError?.(err as Error);
      },
    });
    const sessionStr = (this.client!.session as StringSession).save();
    await saveSession(sessionStr);
  }

  async logout(): Promise<void> {
    try {
      if (this.client) {
        await this.client.invoke(new Api.auth.LogOut());
        await this.client.disconnect();
      }
    } catch (e) {
      console.warn('[telegram] logout error (continuing):', e);
    }
    await clearSession();
    this.client = null;
    this.session = new StringSession('');
  }

  async sendVoiceNote(oggBytes: Buffer, durationSec: number): Promise<void> {
    await this.ensureConnected();
    const file = new CustomFile('voice.ogg', oggBytes.length, '', oggBytes);
    await this.client!.sendFile(BOT_USERNAME, {
      file,
      voiceNote: true,
      attributes: [
        new Api.DocumentAttributeAudio({
          voice: true,
          duration: Math.max(1, Math.round(durationSec)),
        }),
      ],
    });
  }

  get isReady(): boolean {
    return !!this.client && !!this.client.connected;
  }
}

export const telegram = new TelegramService();
