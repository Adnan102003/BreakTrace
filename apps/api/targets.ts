import { randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as requestHttp } from 'node:http';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { checkServerIdentity } from 'node:tls';
import ipaddr from 'ipaddr.js';

type Address = { address: string; family: number };
export type TargetResponse = { status: number; headers: Record<string, string>; body: Buffer };
type RequestTarget = (
  url: URL,
  address: string,
  method: 'GET' | 'HEAD',
  accept?: string,
) => Promise<TargetResponse>;
export type PinnedTarget = {
  origin: string;
  read: (url: URL, method: 'GET' | 'HEAD', accept?: string) => Promise<TargetResponse>;
};
export type TargetProof = { projectId: string; origin: string; token: string; verifiedAt: string };
const maxResponseBytes = 3 * 1024 * 1024;

export class TargetError extends Error {}

export function externalOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TargetError('Enter an HTTPS origin');
  }
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(url.hostname)
  ) {
    throw new TargetError('Use a public DNS hostname on HTTPS port 443, without a path or credentials');
  }
  return url.origin;
}

export function localTargetOrigin(value: string) {
  const match = /^http:\/\/127\.0\.0\.1:([1-9]\d{3,4})\/?$/.exec(value);
  if (!match || Number(match[1]) < 1024 || Number(match[1]) > 65535) {
    throw new TargetError('Use an explicit HTTP origin on 127.0.0.1 with a non-privileged port');
  }
  return `http://127.0.0.1:${match[1]}`;
}

export const targetOrigin = (value: string) =>
  value.startsWith('http:') ? localTargetOrigin(value) : externalOrigin(value);

export function publicAddress(address: string) {
  try {
    const parsed = ipaddr.process(address);
    if (parsed.range() !== 'unicast') return false;
    if (parsed.kind() === 'ipv6') return (parsed as ipaddr.IPv6).match(ipaddr.IPv6.parse('2000::'), 3);
    return true;
  } catch {
    return false;
  }
}

export function requestPinned(
  url: URL,
  address: string,
  method: 'GET' | 'HEAD',
  accept?: string,
): Promise<TargetResponse> {
  return new Promise((resolve, reject) => {
    const secure = url.protocol === 'https:';
    const send = secure ? request : requestHttp;
    const req = send(
      {
        host: address,
        port: secure ? 443 : Number(url.port),
        ...(secure
          ? {
              servername: url.hostname,
              checkServerIdentity: (_host: string, cert: Parameters<typeof checkServerIdentity>[1]) =>
                checkServerIdentity(url.hostname, cert),
              rejectUnauthorized: true,
            }
          : {}),
        agent: false,
        method,
        path: url.pathname + url.search,
        signal: AbortSignal.timeout(4500),
        maxHeaderSize: 16_384,
        headers: {
          Host: url.host,
          Accept: accept?.slice(0, 300) || '*/*',
          'Accept-Encoding': 'identity',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (
          status < 200 ||
          (status >= 300 && status < 400) ||
          Number(res.headers['content-length']) > maxResponseBytes ||
          !['identity', undefined].includes(res.headers['content-encoding'])
        ) {
          res.destroy();
          reject(
            new TargetError('The target returned a redirect, oversized body, or unsupported encoding'),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxResponseBytes) {
            res.destroy(new TargetError('Target response exceeded the byte limit'));
            return;
          }
          chunks.push(chunk);
        });
        res.once('error', reject);
        res.once('end', () => {
          const headers: Record<string, string> = { 'cache-control': 'no-store' };
          for (const name of ['content-type', 'content-security-policy', 'x-content-type-options']) {
            const value = res.headers[name];
            if (typeof value === 'string') headers[name] = value;
          }
          resolve({ status, headers, body: Buffer.concat(chunks) });
        });
      },
    );
    req.once('error', reject);
    req.end();
  });
}

const verifyPath = (token: string) => `/.well-known/breaktrace/${token}.txt`;
const proofText = (token: string) => `breaktrace:${token}`;

export class TargetAuthority {
  private readonly allowed: Set<string>;
  private readonly localAllowed: Set<string>;
  private readonly challenges = new Map<string, { origin: string; token: string; expiresAt: number }>();

  constructor(
    origins: string[],
    private readonly resolve: (name: string) => Promise<Address[]> = (name) =>
      lookup(name, { all: true }),
    private readonly send: RequestTarget = requestPinned,
    localOrigins: string[] = [],
  ) {
    this.allowed = new Set(origins.map(externalOrigin));
    this.localAllowed = new Set(localOrigins.map(localTargetOrigin));
  }

  includes(origin: string) {
    return this.allowed.has(origin) || this.localAllowed.has(origin);
  }

  cancelChallenge(projectId: string) {
    this.challenges.delete(projectId);
  }

  issue(projectId: string, origin: string) {
    if (!this.includes(origin))
      throw new TargetError(
        'Add this origin to the staging or local target allowlist on the operator machine',
      );
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60_000;
    this.challenges.set(projectId, { origin, token, expiresAt });
    return {
      path: verifyPath(token),
      contents: proofText(token),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  private async pin(origin: string): Promise<PinnedTarget> {
    if (!this.includes(origin))
      throw new TargetError('The target origin is no longer approved by the operator');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hostname = new URL(origin).hostname;
    let answers: Address[];
    const local = this.localAllowed.has(origin);
    try {
      answers = await Promise.race([
        local ? Promise.resolve([{ address: '127.0.0.1', family: 4 }]) : this.resolve(hostname),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new TargetError('Target DNS lookup timed out')), 3500);
        }),
      ]);
    } catch {
      throw new TargetError('Target DNS lookup failed');
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!answers.length || (!local && answers.some((answer) => !publicAddress(answer.address)))) {
      throw new TargetError('Target DNS must resolve exclusively to public addresses');
    }
    const address = (answers.find((answer) => answer.family === 4) ?? answers[0]).address;
    return {
      origin,
      read: async (url, method, accept) => {
        if (
          url.origin !== origin ||
          url.username ||
          url.password ||
          url.href.length > 2048 ||
          !['GET', 'HEAD'].includes(method)
        )
          throw new TargetError('Request is outside the authorized read-only origin');
        const result = await this.send(url, address, method, accept);
        if (result.status < 200 || (result.status >= 300 && result.status < 400)) {
          throw new TargetError('The target attempted a redirect');
        }
        return result;
      },
    };
  }

  private async prove(target: PinnedTarget, token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new TargetError('Target proof is invalid');
    let response: TargetResponse;
    try {
      response = await target.read(new URL(verifyPath(token), target.origin), 'GET', 'text/plain');
    } catch {
      throw new TargetError('The target proof could not be fetched directly from the approved origin');
    }
    const expected = Buffer.from(proofText(token));
    const actual = Buffer.from(response.body.toString('utf8').trim());
    if (
      response.status !== 200 ||
      !/^text\/plain(?:\s*;|$)/i.test(response.headers['content-type'] ?? '') ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new TargetError(
        'The target proof file must return the exact supplied text as HTTP 200 text/plain',
      );
    }
  }

  async verify(projectId: string, origin: string): Promise<TargetProof> {
    const challenge = this.challenges.get(projectId);
    if (!challenge || challenge.origin !== origin || Date.now() >= challenge.expiresAt)
      throw new TargetError('Create a fresh verification challenge for this project');
    await this.prove(await this.pin(origin), challenge.token);
    if (this.challenges.get(projectId) !== challenge)
      throw new TargetError('The verification challenge was replaced');
    this.challenges.delete(projectId);
    return { projectId, origin, token: challenge.token, verifiedAt: new Date().toISOString() };
  }

  async authorized(origin: string, token: string) {
    const target = await this.pin(origin);
    await this.prove(target, token);
    return target;
  }
}
