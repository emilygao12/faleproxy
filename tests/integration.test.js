const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');
const { spawn } = require('child_process');

// --------- Helpers ---------

// Make sure Jest doesn’t try to serialize circular Axios error objects
const sanitizeAxiosError = (err) => {
  if (err && err.isAxiosError) {
    const status = err.response?.status;
    const data = err.response?.data;
    const message = err.message;
    return { isAxiosError: true, status, data, message };
  }
  return { message: String((err && err.message) || err) };
};

// Allow localhost connections for the test server, but block external by default
beforeAll(() => {
  nock.cleanAll();
  nock.disableNetConnect();
  // allow only the local test server; block everything else so nock must intercept
  nock.enableNetConnect(/^(localhost|127\.0\.0\.1)(:\d+)?$/);
});

// Clean up nock after all tests
afterAll(() => {
  try { nock.cleanAll(); } catch {}
  try { nock.enableNetConnect(); } catch {}
});

// --------- Test server setup ---------

// Use a different port to avoid collisions with local dev
const TEST_PORT = 3099;
let server;

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Create a temporary test app and patch its port (GNU sed for Ubuntu runner)
    await execAsync('cp app.js app.test.js');
    await execAsync(`sed -i 's/const PORT = 3001/const PORT = ${TEST_PORT}/' app.test.js`);

    // Start the test server (no detached process group)
    server = spawn(process.execPath, ['app.test.js'], {
      stdio: 'ignore'
    });

    // Give the server time to start
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 15000);

  afterAll(async () => {
    // Kill the test server and clean up
    try {
      if (server && server.pid) server.kill();
    } catch {}
    try {
      await execAsync('rm app.test.js');
    } catch {}
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Mock external HTTP request
    nock('https://example.com').get('/').reply(200, sampleHtmlWithYale);

    // Make a request to our proxy app
    const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
      url: 'https://example.com/'
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    // Verify replacements in text
    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');

    // URLs remain unchanged (still contain yale.edu)
    const links = $('a');
    let hasYaleUrl = false;
    links.each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) hasYaleUrl = true;
    });
    expect(hasYaleUrl).toBe(true);

    // Link text changed
    expect($('a').first().text()).toBe('About Fale');
  }, 10000);

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, { url: 'not-a-valid-url' });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      const safe = sanitizeAxiosError(error);
      expect(safe.status).toBe(500);
      // Optional: expect(safe.message).toContain('Invalid URL'); // depends on your app.js
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      const safe = sanitizeAxiosError(error);
      expect(safe.status).toBe(400);
      // Axios returns the server JSON in error.response.data
      expect(safe.data?.error || '').toBe('URL is required');
    }
  });
});
