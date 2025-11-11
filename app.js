// app.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = 3001; // keep this exact literal: tests patch this with sed

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Case-preserving replacement: YALE->FALE, Yale->Fale, yale->fale
function replaceYaleCasePreserving(str) {
  return str.replace(/yale/gi, (m) => {
    if (m === m.toUpperCase()) return 'FALE';       // YALE -> FALE
    if (m[0] === m[0].toUpperCase()) return 'Fale'; // Yale -> Fale
    return 'fale';                                  // yale -> fale
  });
}

// API endpoint to fetch and modify content
app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Fetch the content from the provided URL as raw text
    const response = await axios.get(url, {
      responseType: 'text',
      transformResponse: (r) => r,
      headers: { 'User-Agent': 'Mozilla/5.0 (Faleproxy)' },
      validateStatus: () => true, // allow non-2xx; we still want the body
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
        const newText = replaceYaleCasePreserving(text);
        if (text !== newText) $(this).replaceWith(newText);
      });

    // Replace in <title> explicitly
    if ($('title').length) {
      const newTitle = replaceYaleCasePreserving($('title').text());
      $('title').text(newTitle);
    }

    return res.json({
      success: true,
      content: $.html(),
      title: $('title').text() || undefined,
      originalUrl: url,
    });
  } catch (error) {
    console.error('Error fetching URL:', error.message);
    return res.status(500).json({
      error: `Failed to fetch content: ${error.message}`,
    });
  }
});

// Start the server (the integration test launches this file as a separate process)
app.listen(PORT, () => {
  console.log(`Faleproxy server running at http://localhost:${PORT}`);
});
