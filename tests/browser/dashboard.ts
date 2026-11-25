import { expect, test as base } from '@playwright/test';

export { expect };

export const test = base.extend<{ dashboardDiagnostics: void }>({
  dashboardDiagnostics: [
    async ({ page }, use, info) => {
      const consoleMessages: { type: string; text: string }[] = [];
      const pageErrors: string[] = [];
      const apiFailures: string[] = [];
      let apiResponses = 0;
      page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type()))
          consoleMessages.push({ type: message.type(), text: message.text() });
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('response', (response) => {
        const path = new URL(response.url()).pathname;
        if (!path.startsWith('/api/')) return;
        apiResponses++;
        if (response.status() >= 400)
          apiFailures.push(`${response.request().method()} ${path} HTTP ${response.status()}`);
      });
      page.on('requestfailed', (request) => {
        const path = new URL(request.url()).pathname;
        const reason = request.failure()?.errorText;
        if (path.startsWith('/api/') && reason !== 'net::ERR_ABORTED')
          apiFailures.push(`${request.method()} ${path} ${reason}`);
      });
      await use();
      await info.attach('dashboard-diagnostics', {
        contentType: 'application/json',
        body: JSON.stringify({ apiResponses, consoleMessages, pageErrors, apiFailures }),
      });
      expect({
        pageErrors,
        consoleErrors: consoleMessages.filter(({ type }) => type === 'error'),
        apiFailures,
      }).toEqual({ pageErrors: [], consoleErrors: [], apiFailures: [] });
    },
    { auto: true },
  ],
});
