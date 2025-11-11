// app.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = 3001; // IMPORTANT: keep this literal; tests replace it with a test port

// ---------------------------
// Middleware & static assets
// ---------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------
// Helpers
// ---------------------------

// Case-preserving Yale→Fale:
//  - YALE  -> FALE
//  - Yale  -> Fale
//  - yale  -> fale
function replaceYaleCasePreserving(str) {
  return str.replace(/yale/gi, (m) => {
    if (m === m.toUpperCase()) return 'FALE';         // YALE -> FALE
    if (m[0] === m[0].toUpperCase()) return 'Fale';   // Yale -> Fale
    return 'fale';                                     // yale -> fale
  });
}

// Replace only in text nodes (avoid touching href/src URLs or other attributes)
function replaceInTextNodes($) {
  $('body *')
    .contents()
    .filter(function () {
      return this.nodeType === 3; // text node
    })
    .each(function () {
      const text = $(this).text();
      const newText = replaceYaleCasePreserving(text);
      if (text !== newText) $(this).replaceWith(newText);
    });
}

// ---------------------------
// Routes
// ---------------------------

// Serve the main page (if present)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST /fetch
// Body: { url: "https://example.com/" }
// Response: { success: true, originalUrl, content, title? } (on success)
//           { error: "Failed to fetch content: ..." } (on failure)
app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Fetch remote HTML as raw text (avoid JSON transforms)
    const response = await axios.get(url, {
      responseType: 'text',
      transformResponse: (r) => r,
      headers: { 'User-Agent': 'Mozilla/5.0 (Faleproxy)' },
      validateStatus: () => true, // we still want the body even for non-2xx
    });

    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    // Replace in visible text nodes
    replaceInTextNodes($);

    // Replace in <title> explicitly
    if ($('title').length) {
      const newTitle = replaceYaleCasePreserving($('title').text());
      $('title').text(newTitle);
    }

    return res.json({
      success: true,
      originalUrl: url,
      content: $.html(),
      title: $('title').text() || undefined,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: `Failed to fetch content: ${error.message}` });
  }
});

// ---------------------------
// Start server (integration tests launch this file as a process)
// ---------------------------
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Faleproxy server running at http://localhost:${PORT}`);
});