import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { CustomFile } from 'telegram/client/uploads';
import { loadSession, saveSession, clearSession } from './session-store';

const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || '';
const BOT_USERNAME = process.env.POKE_BOT_USERNAME || 'interaction_poke_bot';
const TRANSPORT = (process.env.TELEGRAM_TRANSPORT || 'auto').toLowerCase();

if (!API_ID || !API_HASH) {
  // Fatal config error — surfaced in main on first use.
  console.warn('[telegram] Missing TELEGRAM_API_ID / TELEGRAM_API_HASH in env');
}

// Every message/caption we push to Poke ends with this so it's obvious which
// app originated it. Kept short so it doesn't crowd a caption.
const SIGNATURE = '(Sent with WhisperPoke)';

function withSignature(caption?: string): string {
  const body = (caption ?? '').trim();
  if (!body) return SIGNATURE;
  if (body.includes(SIGNATURE)) return body;
  return `${body}\n\n${SIGNATURE}`;
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

  private transportOrder(): boolean[] {
    if (TRANSPORT === 'wss') return [true];
    if (TRANSPORT === 'tcp') return [false];
    // Auto mode prefers WSS because many networks block MTProto TCP on port 80.
    return [true, false];
  }

  private async connectWithFallback(): Promise<void> {
    let lastErr: unknown;
    for (const useWSS of this.transportOrder()) {
      const candidate = new TelegramClient(this.session, API_ID, API_HASH, {
        connectionRetries: 3,
        useWSS,
      });
      try {
        await candidate.connect();
        this.client = candidate;
        if (TRANSPORT === 'auto') {
          console.info(`[telegram] connected via ${useWSS ? 'wss' : 'tcp'} transport`);
        }
        return;
      } catch (err) {
        lastErr = err;
        try {
          await candidate.disconnect();
        } catch {
          // Ignore disconnect cleanup failures while trying the next transport.
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Failed to connect to Telegram');
  }

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
      await this.connectWithFallback();
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
      caption: SIGNATURE,
      attributes: [
        new Api.DocumentAttributeAudio({
          voice: true,
          duration: Math.max(1, Math.round(durationSec)),
        }),
      ],
    });
  }

  async sendText(message: string): Promise<void> {
    await this.ensureConnected();
    await this.client!.sendMessage(BOT_USERNAME, { message: withSignature(message) });
  }

  // Generic attachment send — accepts a filesystem path or in-memory buffer.
  // `caption` is shown alongside the file in Telegram.
  async sendFileAttachment(
    input: { path?: string; buffer?: Buffer; name?: string; mime?: string },
    caption?: string,
  ): Promise<void> {
    await this.ensureConnected();
    let file: string | CustomFile;
    if (input.path) {
      file = input.path;
    } else if (input.buffer) {
      const name = input.name || 'file';
      file = new CustomFile(name, input.buffer.length, '', input.buffer);
    } else {
      throw new Error('sendFileAttachment: need path or buffer');
    }
    await this.client!.sendFile(BOT_USERNAME, {
      file,
      caption: withSignature(caption),
      forceDocument: false,
    });
  }

  // Video snippet (webm/mp4 blob). Sent as a regular video attachment, not
  // a round video note.
  async sendVideo(
    buffer: Buffer,
    durationSec: number,
    caption?: string,
    name = 'snippet.webm',
  ): Promise<void> {
    await this.ensureConnected();
    const file = new CustomFile(name, buffer.length, '', buffer);
    await this.client!.sendFile(BOT_USERNAME, {
      file,
      caption: withSignature(caption),
      attributes: [
        new Api.DocumentAttributeVideo({
          duration: Math.max(1, Math.round(durationSec)),
          w: 640,
          h: 480,
          supportsStreaming: true,
        }),
      ],
    });
  }

  get isReady(): boolean {
    return !!this.client && !!this.client.connected;
  }
}

export const telegram = new TelegramService();
