const http = require('http');
const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');
const { spawn } = require('child_process');

// ---------- Network controls ----------

// Allow only localhost for the duration of these tests
beforeAll(() => {
  nock.cleanAll();
  nock.disableNetConnect();
  nock.enableNetConnect(/^(localhost|127\.0\.0\.1)(:\d+)?$/);
});

afterAll(() => {
  try { nock.cleanAll(); } catch {}
  try { nock.enableNetConnect(); } catch {}
});

// ---------- Local stub server that serves the Yale HTML ----------

const STUB_PORT = 3101;
let stubServer;

const startStubServer = () =>
  new Promise((resolve) => {
    stubServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(sampleHtmlWithYale);
    });
    stubServer.listen(STUB_PORT, () => resolve());
  });

const stopStubServer = () =>
  new Promise((resolve) => {
    if (!stubServer) return resolve();
    stubServer.close(() => resolve());
  });

// ---------- Child app process management ----------

const TEST_PORT = 3099; // the app under test will listen here (we patch app.js)
let serverProc;

describe('Integration Tests', () => {
  beforeAll(async () => {
    // 1) Start the local stub server which serves Yale HTML
    await startStubServer();

    // 2) Copy app.js and patch its port (GNU sed for Ubuntu runner)
    await execAsync('cp app.js app.test.js');
    await execAsync(`sed -i 's/const PORT = 3001/const PORT = ${TEST_PORT}/' app.test.js`);

    // 3) Launch the child app process
    serverProc = spawn(process.execPath, ['app.test.js'], { stdio: 'ignore' });

    // 4) Give it a moment to bind the port
    await new Promise((r) => setTimeout(r, 1500));
  }, 20000);

  afterAll(async () => {
    try { if (serverProc && serverProc.pid) serverProc.kill(); } catch {}
    try { await execAsync('rm app.test.js'); } catch {}
    await stopStubServer();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Point the app to our local stub instead of example.com
    const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
      url: `http://localhost:${STUB_PORT}/`
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    const $ = cheerio.load(response.data.content);
    // Title/text should be rewritten
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');

    // Link URL should remain unchanged (still yale.edu)
    let hasYaleUrl = false;
    $('a').each((_, link) => {
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
      expect(true).toBe(false);
    } catch (error) {
      // Axios throws with an error having response/status
      expect(error.response?.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response?.status).toBe(400);
      expect(error.response?.data?.error).toBe('URL is required');
    }
  });
});
