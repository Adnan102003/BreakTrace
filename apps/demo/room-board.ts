import express from 'express';
import { readFile } from 'node:fs/promises';

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Room Board</title>
<main><h1 data-testid="title">Room Board</h1><p>Check lab availability for the afternoon.</p>
<label>Room filter <input data-testid="room-filter" type="search"></label>
<button data-testid="view-availability">View availability</button>
<section data-testid="summary" hidden><h2>Availability</h2><p>Free seats <output data-testid="free-seats"></output></p></section>
</main><script defer src="/room-board.js"></script></html>`;

const script = `
const summary = document.querySelector('[data-testid="summary"]');
document.querySelector('[data-testid="view-availability"]').addEventListener('click', async () => {
  const query = document.querySelector('[data-testid="room-filter"]').value.trim().toLowerCase();
  if (query && !'quiet lab'.includes(query)) { summary.hidden = true; return; }
  const payload = await fetch('/availability/quiet-lab').then(response => response.json());
  const capacity = Number(payload.room.capacity || 0);
  document.querySelector('[data-testid="free-seats"]').textContent = String(capacity - payload.reserved);
  summary.hidden = false;
});`;

export async function startRoomBoard(port = 0, proofFile?: string) {
  const app = express();
  app.disable('x-powered-by');
  let proof = '';
  app.use((_req, res, next) => {
    res.set(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    );
    next();
  });
  app.get(['/', '/board'], (_req, res) => {
    res.type('html').send(html);
  });
  app.get('/room-board.js', (_req, res) => {
    res.type('js').send(script);
  });
  app.get('/availability/quiet-lab', (_req, res) => {
    res.json({ room: { name: 'Quiet Lab', capacity: 8 }, reserved: 3, blocked: false });
  });
  app.get('/.well-known/breaktrace/:file', async (req, res) => {
    const contents = proofFile ? await readFile(proofFile, 'utf8').catch(() => '') : proof;
    const token = /^breaktrace:([a-f0-9]{64})$/.exec(contents.trim())?.[1];
    if (!token || req.params.file !== `${token}.txt`) return res.sendStatus(404);
    res.type('text/plain').send(contents.trim());
  });
  app.get('/redirect', (_req, res) => res.redirect('http://127.0.0.1:4311/api/config'));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(port, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Room Board failed to start');
  return {
    url: `http://127.0.0.1:${address.port}`,
    setProof(contents: string) {
      proof = contents;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
