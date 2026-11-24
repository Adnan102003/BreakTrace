import { defineConfig } from '@playwright/test';
import configuration from './playwright.config';

export default defineConfig(configuration, {
  testDir: './tests/generated',
  outputDir: process.env.BREAKTRACE_GENERATED_OUTPUT || 'test-results/generated',
  use: { actionTimeout: 5000, navigationTimeout: 7000 },
});
