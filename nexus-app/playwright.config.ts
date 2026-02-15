import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    timeout: 60 * 1000,
    expect: {
        timeout: 10 * 1000,
    },
    workers: process.env.CI ? 1 : undefined,
    reporter: [['list'], ['html']],
    use: {
        baseURL: 'http://localhost:1422',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:1422',
        reuseExistingServer: true,
        timeout: 120 * 1000,
    },
});
