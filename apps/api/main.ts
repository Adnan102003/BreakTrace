import 'dotenv/config';
import { z } from 'zod';
import { createControlPlane } from './app';

const port = z.coerce
  .number()
  .int()
  .min(1024)
  .max(65535)
  .parse(process.env.BREAKTRACE_PORT ?? 4311);
const control = createControlPlane(process.env.BREAKTRACE_DATA || '.data', {
  serveWeb: true,
  model: process.env.BREAKTRACE_OLLAMA_MODEL,
});
const host = process.env.BREAKTRACE_CONTAINER === '1' ? '0.0.0.0' : '127.0.0.1';
control.server.listen(port, host, () =>
  console.log(`BreakTrace workspace available at http://127.0.0.1:${port}`),
);
