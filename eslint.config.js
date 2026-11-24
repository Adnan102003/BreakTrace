import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '.tools/**',
      '.data/**',
      'tests/generated/**',
      'test-results/**',
      'playwright-report/**',
      'apps/demo/public/**',
    ],
  },
  { files: ['**/*.{ts,tsx}'], extends: [eslint.configs.recommended, ...tseslint.configs.recommended] },
);
