import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const pub = new URL('./public/', import.meta.url);
const products = [
  {
    id: 'field-pack',
    name: 'Field Pack',
    price: 4800,
    badge: 'Bestseller',
    stock: 8,
    color: 'clay',
    details: { description: 'A durable day pack with an easy-access front pocket.', capacity: '18 L' },
  },
  {
    id: 'desk-lamp',
    name: 'Desk Lamp',
    price: 6800,
    badge: 'New',
    stock: 5,
    color: 'ink',
    details: { description: 'A compact lamp with warm, adjustable light.', capacity: 'USB-C' },
  },
  {
    id: 'water-bottle',
    name: 'Trail Bottle',
    price: 2400,
    badge: 'Essential',
    stock: 12,
    color: 'moss',
    details: { description: 'An insulated bottle for long days outside.', capacity: '750 mL' },
  },
];
const orderSchema = z.object({
  items: z
    .array(z.object({ id: z.string().max(40), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(3),
  discount: z.boolean(),
});

function quote(input: unknown) {
  const order = orderSchema.safeParse(input);
  if (!order.success) return null;
  let subtotal = 0;
  const unique = new Set<string>();
  for (const item of order.data.items) {
    const product = products.find((product) => product.id === item.id);
    if (!product || item.quantity > product.stock || unique.has(item.id)) return null;
    unique.add(item.id);
    subtotal += product.price * item.quantity;
  }
  const discount = order.data.discount ? Math.min(960, Math.round(subtotal / 10)) : 0;
  return { subtotal, discount, total: subtotal - discount };
}

export const originalPricing = 'const price = Number.isSafeInteger(product.price) ? product.price : 0;';
export const repairedPricing =
  'const price = [product.price, product.productPrice].find((value) => Number.isSafeInteger(value) && value >= 0);\n  if (price === undefined) throw new Error("Price unavailable");';
export function reviewedPatch(source: string) {
  if (source.split(originalPricing).length !== 2)
    throw new Error('Reviewed patch anchor missing or ambiguous');
  return source.replace(originalPricing, repairedPricing);
}

export const demoClient = () => readFile(new URL('client.js', pub), 'utf8');

export async function startDemo(
  options: { port?: number; reviewedClient?: string; resilient?: boolean } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));
  app.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    next();
  });
  const source = options.reviewedClient ?? (await demoClient());
  const client = options.resilient ? reviewedPatch(source) : source;
  app.get('/client.js', (_req, res) => res.type('js').send(client));
  app.get('/store.css', (_req, res) => res.sendFile(fileURLToPath(new URL('store.css', pub))));
  app.get(['/', '/product/:id', '/cart', '/checkout', '/confirmation'], (_req, res) =>
    res.sendFile(fileURLToPath(new URL('index.html', pub))),
  );
  app.get('/api/store/catalog', (_req, res) => res.json({ products }));
  app.get('/api/store/product/:id', (req, res) => {
    const product = products.find((entry) => entry.id === req.params.id);
    if (!product) return res.status(404).json({ error: 'Product unavailable' });
    return res.json(
      options.resilient
        ? { ...product, details: { ...product.details, inventoryUnit: 'units' } }
        : product,
    );
  });
  app.get('/api/store/quote', (req, res) => {
    let input: unknown;
    try {
      input = JSON.parse(String(req.query.order ?? ''));
    } catch {
      input = null;
    }
    const result = quote(input);
    if (!result) return res.status(422).json({ error: 'Check the order and inventory' });
    return res.json(result);
  });
  app.post('/api/store/payment', (req, res) => {
    const result = quote(req.body);
    if (!result) return res.status(422).json({ error: 'Check the order and inventory' });
    return res.json({ ...result, confirmation: 'FW-DEMO', status: 'confirmed' });
  });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(options.port ?? 0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Demo listener did not start');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
