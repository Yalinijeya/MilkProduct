import { connect } from 'cloudflare:sockets';
import { toBase64 } from './util';

/**
 * Minimal SMTP client for sending the new-order email from a Worker.
 * Port 465 = TLS from the start (recommended for Gmail), 587 = STARTTLS.
 * Port 25 is blocked on Cloudflare.
 */
export interface MailOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

const TIMEOUT_MS = 20_000;

type Socket = ReturnType<typeof connect>;

class SmtpConnection {
  private reader!: ReadableStreamDefaultReader<Uint8Array>;
  private writer!: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = '';
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  constructor(private socket: Socket) {
    this.attach();
  }

  private attach(): void {
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();
  }

  /** Switches the open connection to TLS (after the STARTTLS command). */
  upgrade(): void {
    this.reader.releaseLock();
    this.writer.releaseLock();
    this.socket = this.socket.startTls();
    this.buffer = '';
    this.attach();
  }

  /** Reads one (possibly multi-line) reply: "250-first\r\n250 last\r\n". */
  async reply(): Promise<{ code: number; text: string }> {
    const lines: string[] = [];
    for (;;) {
      const nl = this.buffer.indexOf('\r\n');
      if (nl >= 0) {
        const line = this.buffer.slice(0, nl);
        this.buffer = this.buffer.slice(nl + 2);
        lines.push(line);
        if (/^\d{3}( |$)/.test(line)) return { code: Number(line.slice(0, 3)), text: lines.join(' | ') };
        continue;
      }
      const { value, done } = await this.reader.read();
      if (done) throw new Error(`SMTP connection closed${lines.length ? ': ' + lines.join(' | ') : ''}`);
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }

  async send(data: string): Promise<void> {
    await this.writer.write(this.encoder.encode(data));
  }

  /** Sends a command and checks the reply code. `secret` hides the command in error messages. */
  async command(line: string, expect: number[], secret = false): Promise<string> {
    await this.send(line + '\r\n');
    const r = await this.reply();
    if (!expect.includes(r.code)) {
      const what = secret ? '(credentials)' : line.split(' ')[0];
      throw new Error(`SMTP ${what} failed: ${r.text}`);
    }
    return r.text;
  }

  async close(): Promise<void> {
    try {
      await this.socket.close();
    } catch {
      /* ignore */
    }
  }
}

/** "=?UTF-8?B?...?=" so non-English text (and the – dash) survives in headers. */
const encodeHeader = (s: string): string => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${toBase64(s)}?=`);

/** Base64 body wrapped at 76 characters per line. */
const base64Body = (s: string): string => toBase64(s).replace(/.{1,76}/g, '$&\r\n');

function buildMessage(o: MailOptions): string {
  const boundary = `=_${crypto.randomUUID().replace(/-/g, '')}`;
  const domain = o.from.split('@')[1] ?? 'localhost';
  const from = o.fromName ? `${encodeHeader(o.fromName.replace(/"/g, ''))} <${o.from}>` : o.from;
  return [
    `From: ${from}`,
    `To: ${o.to.join(', ')}`,
    `Subject: ${encodeHeader(o.subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(o.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(o.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export async function sendSmtpMail(o: MailOptions): Promise<void> {
  const implicitTls = o.port === 465;
  const socket = connect({ hostname: o.host, port: o.port }, { secureTransport: implicitTls ? 'on' : 'starttls', allowHalfOpen: false });
  const smtp = new SmtpConnection(socket);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`SMTP timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
  });

  const conversation = async () => {
    const greeting = await smtp.reply();
    if (greeting.code !== 220) throw new Error(`SMTP server said: ${greeting.text}`);

    let features = await smtp.command('EHLO milkshop.workers.dev', [250]);
    if (!implicitTls) {
      if (!/STARTTLS/i.test(features)) throw new Error('SMTP server does not offer STARTTLS');
      await smtp.command('STARTTLS', [220]);
      smtp.upgrade();
      features = await smtp.command('EHLO milkshop.workers.dev', [250]);
    }

    if (o.username) {
      if (/AUTH[ =][^|]*PLAIN/i.test(features)) {
        await smtp.command(`AUTH PLAIN ${toBase64(`\0${o.username}\0${o.password}`)}`, [235], true);
      } else {
        await smtp.command('AUTH LOGIN', [334]);
        await smtp.command(toBase64(o.username), [334], true);
        await smtp.command(toBase64(o.password), [235], true);
      }
    }

    await smtp.command(`MAIL FROM:<${o.from}>`, [250]);
    for (const to of o.to) await smtp.command(`RCPT TO:<${to}>`, [250, 251]);
    await smtp.command('DATA', [354]);
    // Body parts are base64, so no line starts with "." and no dot-stuffing is needed.
    await smtp.command(`${buildMessage(o)}\r\n.`, [250]);
    await smtp.command('QUIT', [221]).catch(() => undefined);
  };

  try {
    await Promise.race([conversation(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await smtp.close();
  }
}
