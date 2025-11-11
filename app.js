// app.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // use env for CI/Vercel

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Root page (serves your index.html if present)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Optional health check
app.get('/health', (_req, res) => {
  res.status(200).send('Faleproxy is healthy');
});

/**
 * POST /fetch
 * Body: { "url": "https://example.com/" }
 * Response: { success: true, originalUrl, content, title? }
 */
app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Fetch remote HTML as raw text (no auto JSON parsing)
    const response = await axios.get(url, {
      responseType: 'text',
      transformResponse: (r) => r,
      // optional headers to avoid some sites blocking
      headers: { 'User-Agent': 'Mozilla/5.0 Faleproxy' }
    });

    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    // Replace text nodes only (avoid changing attributes/URLs)
    $('body *')
      .contents()
      .filter(function () {
        return this.nodeType === 3; // text node
      })
      .each(function () {
        const text = $(this).text();
        // Case-insensitive replace with simple capitalization preservation
        const newText = text
          .replace(/Yale/g, 'Fale')
          .replace(/yale/g, 'fale');
        if (text !== newText) $(this).replaceWith(newText);
      });

    // Replace in <title> explicitly
    if ($('title').length) {
      const newTitle = $('title')
        .text()
        .replace(/Yale/g, 'Fale')
        .replace(/yale/g, 'fale');
      $('title').text(newTitle);
    }

    const outTitle = $('title').text() || undefined;

    return res.status(200).json({
      success: true,
      originalUrl: url,
      content: $.html(),
      ...(outTitle ? { title: outTitle } : {})
    });
  } catch (error) {
    // Keep message stable for tests
    return res
      .status(500)
      .json({ error: `Failed to fetch content: ${error.message}` });
  }
});

// Export for tests; only listen when run directly
if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Faleproxy server running at http://localhost:${PORT}`);
  });
} else {
  module.exports = app;
}
