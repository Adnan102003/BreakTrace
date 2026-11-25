import 'dotenv/config';
import { z } from 'zod';
import { createControlPlane, operatorPasswordSchema } from './app';
import { connectMongo } from './mongo';
import { TargetAuthority } from './targets';

const port = z.coerce
  .number()
  .int()
  .min(1024)
  .max(65535)
  .parse(process.env.BREAKTRACE_PORT ?? 4311);
const data = process.env.BREAKTRACE_DATA || '.data';
const password = process.env.BREAKTRACE_OPERATOR_PASSWORD || undefined;
if (process.env.BREAKTRACE_REQUIRE_OPERATOR_AUTH === '1' && !password)
  throw new Error('Set BREAKTRACE_OPERATOR_PASSWORD for this deployment.');
if (password && !operatorPasswordSchema.safeParse(password).success)
  throw new Error('BREAKTRACE_OPERATOR_PASSWORD must be a 32 to 128 character base64url secret.');
const targets = new TargetAuthority(
  (process.env.BREAKTRACE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  undefined,
  undefined,
  (process.env.BREAKTRACE_ALLOWED_LOCAL_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const store = process.env.BREAKTRACE_MONGO_URI
  ? await connectMongo(
      process.env.BREAKTRACE_MONGO_URI,
      data,
      process.env.BREAKTRACE_MONGO_DB || 'breaktrace',
    )
  : undefined;
const control = createControlPlane(data, {
  serveWeb: true,
  model: process.env.BREAKTRACE_OLLAMA_MODEL,
  store,
  targets,
  operatorPassword: password,
});
await control.ready;
const host = process.env.BREAKTRACE_CONTAINER === '1' ? '0.0.0.0' : '127.0.0.1';
control.server.listen(port, host, () =>
  console.log(`BreakTrace workspace available at http://127.0.0.1:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void control.close().catch(() => {
      process.exitCode = 1;
    });
  });
}
