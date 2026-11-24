import type { ApiOperation, Gate, Project, Scenario, Workflow } from './contracts';

export const endpoints: ApiOperation[] = [
  { method: 'GET', path: '/api/store/catalog' },
  { method: 'GET', path: '/api/store/product/field-pack' },
  { method: 'GET', path: '/api/store/product/desk-lamp' },
  { method: 'GET', path: '/api/store/product/water-bottle' },
  { method: 'GET', path: '/api/store/quote' },
  { method: 'POST', path: '/api/store/payment' },
];
export const projects: Project[] = [
  { id: 'fieldwork-shop', name: 'Fieldwork Shop', version: 'original' },
  { id: 'fieldwork-resilient', name: 'Fieldwork Shop · Resilient', version: 'resilient' },
];
export const thresholds: Gate = { warning: 25, block: 60 };
const dom = (key: string) => ({ from: 'dom' as const, key });
export const checkout: Workflow = {
  id: 'checkout',
  name: 'Cart to checkout',
  start: '/',
  steps: [
    { action: 'click', target: 'view-product', path: '/product/field-pack' },
    { action: 'click', target: 'add-to-cart', path: '/cart' },
    { action: 'click', target: 'increase-quantity' },
    { action: 'click', target: 'apply-discount' },
    {
      action: 'rules',
      rules: [
        {
          id: 'positive-price',
          name: 'Displayed unit price is positive',
          op: 'range',
          source: dom('unit-price'),
          min: 1,
          max: 100000,
        },
        {
          id: 'cart-arithmetic',
          name: 'Cart total matches items less discount',
          op: 'sum-products',
          total: dom('cart-total'),
          terms: [{ price: dom('unit-price'), quantity: dom('quantity') }],
          subtract: dom('discount'),
        },
        {
          id: 'valid-quantity',
          name: 'Quantity fits available inventory',
          op: 'range',
          source: dom('quantity'),
          min: 1,
          max: 8,
        },
        {
          id: 'valid-discount',
          name: 'Discount is within the fixture limit',
          op: 'range',
          source: dom('discount'),
          min: 0,
          max: 960,
        },
      ],
    },
    { action: 'click', target: 'start-checkout', path: '/checkout' },
    {
      action: 'rules',
      rules: [
        {
          id: 'checkout-total',
          name: 'Cart total matches independent checkout quote',
          op: 'equal',
          left: dom('carried-total'),
          right: dom('quote-total'),
        },
      ],
    },
    { action: 'click', target: 'pay', path: '/confirmation' },
    { action: 'text', target: 'order-status', value: 'Order confirmed' },
  ],
};
export const browse: Workflow = {
  id: 'browse',
  name: 'Browse product details',
  start: '/',
  steps: [
    { action: 'click', target: 'view-product', path: '/product/field-pack' },
    { action: 'text', target: 'product-name', value: 'Field Pack' },
    { action: 'visible', target: 'add-to-cart' },
  ],
};
export const workflows = [checkout, browse];

export const renamePrice: Scenario = {
  id: 'price-contract-drift',
  name: 'Price field renamed',
  seed: 42,
  mutations: [
    {
      method: 'GET',
      endpoint: '/api/store/product/field-pack',
      operator: 'rename',
      path: 'price',
      to: 'productPrice',
    },
  ],
};
export const scenarios: Scenario[] = [
  { id: 'baseline', name: 'Baseline only', seed: 42, mutations: [] },
  renamePrice,
  {
    id: 'multi-field-drift',
    name: 'Price rename with unrelated changes',
    seed: 42,
    mutations: [
      { method: 'GET', endpoint: '/api/store/catalog', operator: 'remove', path: 'products.0.badge' },
      ...renamePrice.mutations,
      { method: 'GET', endpoint: '/api/store/product/field-pack', operator: 'null', path: 'badge' },
    ],
  },
  {
    id: 'payment-unavailable',
    name: 'Payment service returns HTTP 503',
    seed: 42,
    mutations: [{ method: 'POST', endpoint: '/api/store/payment', operator: 'status', status: 503 }],
  },
  {
    id: 'optional-metadata',
    name: 'Optional product badge omitted',
    seed: 42,
    mutations: [
      { method: 'GET', endpoint: '/api/store/product/field-pack', operator: 'remove', path: 'badge' },
    ],
  },
];
