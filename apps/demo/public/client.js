const store = document.querySelector('#store');
const money = (cents) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const read = (key, fallback) => JSON.parse(sessionStorage.getItem(key) ?? JSON.stringify(fallback));
const write = (key, value) => sessionStorage.setItem(key, JSON.stringify(value));
const metric = (id, value, formatted) =>
  `<span data-testid="${id}" data-value="${escape(value)}">${escape(formatted)}</span>`;
const title = (label, heading, description = '') =>
  `<div class="intro"><p class="eyebrow">${label}</p><h1>${heading}</h1>${description ? `<p>${description}</p>` : ''}</div>`;
const icon = (color) => ({ clay: '▤', ink: '◒', moss: '◉' })[color] ?? '◈';
const art = (color) =>
  `<div aria-hidden="true" class="product-art ${['clay', 'ink', 'moss'].includes(color) ? color : 'clay'}">${icon(color)}</div>`;
const order = (cart) => ({
  items: cart.items.map(({ id, quantity }) => ({ id, quantity })),
  discount: cart.discount,
});
const currentCart = () => read('cart', { items: [], discount: false });
const cartMath = (cart) => {
  const subtotal = cart.items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  const discount = cart.discount ? Math.min(960, Math.round(Math.max(0, subtotal) / 10)) : 0;
  return { subtotal, discount, total: subtotal - discount };
};

async function get(path, options) {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(1400) });
  if (!response.ok) throw new Error('Store request failed');
  return response.json();
}

function showError() {
  store.innerHTML = `${title('Fieldwork Supply', 'We hit a snag', 'This part of the store is unavailable. Return to the catalog to try again.')}<a class="button" href="/" data-testid="store-error">Back to catalog</a>`;
}

async function catalog() {
  const { products } = await get('/api/store/catalog');
  if (!products.length) {
    store.innerHTML =
      title('FIELD GOODS / COLLECTION', 'No products available') +
      '<a class="button" href="/" data-testid="store-error">Reload catalog</a>';
    return;
  }
  store.innerHTML =
    title(
      'FIELD GOODS / COLLECTION',
      'Built for the everyday.',
      'Useful essentials for the trail, the desk, and everywhere between.',
    ) +
    `<section class="products" aria-label="Catalog">${products.map((product, i) => `<article>${art(product.color)}<div class="card"><p class="eyebrow">${escape(product.badge)}</p><h2>${escape(product.name)}</h2><p>${money(product.price)}</p><a ${i === 0 ? 'data-testid="view-product"' : ''} href="/product/${encodeURIComponent(product.id)}">View product ↗</a></div></article>`).join('')}</section>`;
}

async function productPage(id) {
  const product = await get(`/api/store/product/${encodeURIComponent(id)}`);
  const price = Number.isSafeInteger(product.price) ? product.price : 0;
  store.innerHTML = `<a href="/">← Catalog</a><section class="detail">${art(product.color)}<div>${title('FIELD GOODS / DETAILS', `<span data-testid="product-name">${escape(product.name)}</span>`, escape(product.details?.description))}<p>${escape(product.details?.capacity)}</p><h2>${money(price)}</h2><p>${escape(product.stock)} available</p><button data-testid="add-to-cart">Add to cart →</button></div></section>`;
  store.querySelector('button').addEventListener('click', () => {
    const cart = currentCart();
    const current = cart.items.find((item) => item.id === id);
    if (!current)
      cart.items.push({ id, name: product.name, stock: product.stock, unitPrice: price, quantity: 1 });
    else current.quantity = Math.min(current.stock, current.quantity + 1);
    write('cart', cart);
    location.assign('/cart');
  });
}

function cartPage() {
  const cart = currentCart();
  if (!cart.items.length) {
    store.innerHTML = `${title('YOUR CART', 'Your cart is empty')}<a href="/" class="button">Browse the catalog</a>`;
    return;
  }
  const totals = cartMath(cart);
  store.innerHTML =
    title('YOUR CART', 'Review your gear') +
    `<section class="layout"><div class="panel">${cart.items.map((item, index) => `<div class="line"><div><h2>${escape(item.name)}</h2><p>Unit price ${index === 0 ? metric('unit-price', item.unitPrice, money(item.unitPrice)) : money(item.unitPrice)}</p></div><div class="quantity"><button data-change="-1" data-index="${index}" aria-label="Decrease quantity">−</button>${index === 0 ? metric('quantity', item.quantity, item.quantity) : item.quantity}<button data-change="1" data-index="${index}" aria-label="Increase quantity" ${index === 0 ? 'data-testid="increase-quantity"' : ''}>+</button></div></div>`).join('')}</div>
    <div class="panel summary"><h2>Cart summary</h2><p>Subtotal <span>${money(totals.subtotal)}</span></p><p>Discount ${metric('discount', totals.discount, money(totals.discount))}</p><button class="secondary" data-testid="apply-discount">${cart.discount ? 'Remove 10% discount' : 'Apply 10% discount'}</button><p class="total">Total ${metric('cart-total', totals.total, money(totals.total))}</p><a class="button" href="/checkout" data-testid="start-checkout">Continue to checkout →</a></div></section>`;
  store.querySelectorAll('[data-change]').forEach((button) =>
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const item = cart.items[index];
      item.quantity = Math.min(item.stock, item.quantity + Number(button.dataset.change));
      if (item.quantity <= 0) cart.items.splice(index, 1);
      write('cart', cart);
      cartPage();
    }),
  );
  store.querySelector('[data-testid="apply-discount"]').addEventListener('click', () => {
    cart.discount = !cart.discount;
    write('cart', cart);
    cartPage();
  });
}

async function checkoutPage() {
  const cart = currentCart();
  const input = order(cart);
  const quote = await get(`/api/store/quote?order=${encodeURIComponent(JSON.stringify(input))}`);
  const total = cartMath(cart).total;
  store.innerHTML =
    title('CHECKOUT', 'Complete your order', 'The payment button runs a synthetic transaction.') +
    `<section class="panel summary checkout"><h2>Order summary</h2><p>Cart total ${metric('carried-total', total, money(total))}</p><p class="total">Checkout quote ${metric('quote-total', quote.total, money(quote.total))}</p><button data-testid="pay">Pay with mock payment →</button></section>`;
  store.querySelector('button').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      const result = await get('/api/store/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (result.status !== 'confirmed' || typeof result.confirmation !== 'string')
        throw new Error('Invalid payment response');
      write('receipt', result);
      write('cart', { items: [], discount: false });
      location.assign('/confirmation');
    } catch {
      showError();
    }
  });
}

function confirmation() {
  const receipt = read('receipt', null);
  if (!receipt) return showError();
  store.innerHTML =
    title(
      'ORDER / ' + escape(receipt.confirmation),
      '<span data-testid="order-status">Order confirmed</span>',
      `Mock payment complete for ${money(receipt.total)}.`,
    ) + '<a href="/" class="button">Return to catalog</a>';
}

try {
  const path = location.pathname;
  if (path.startsWith('/product/')) await productPage(decodeURIComponent(path.split('/').at(-1)));
  else if (path === '/cart') cartPage();
  else if (path === '/checkout') await checkoutPage();
  else if (path === '/confirmation') confirmation();
  else await catalog();
} catch {
  showError();
}
