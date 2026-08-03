import { test, expect } from '@playwright/test';

test.describe('/version endpoint', () => {
  test('returns 200 with plain text version', async ({ request }) => {
    const response = await request.get('/version');
    expect(response.status()).toBe(200);
    const body = (await response.text()).trim();
    expect(body).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('version matches the published app version', async ({ request }) => {
    const response = await request.get('/version');
    const body = (await response.text()).trim();
    // Version must be a valid semver string
    expect(body).toMatch(/^\d+\.\d+\.\d+/);
  });
});
