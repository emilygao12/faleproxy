// app.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = 3001; // keep this literal; integration test rewrites it with sed

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- helpers ---

// Strict, case-specific mapping so expectations match exactly:
//   YALE -> FALE
//   Yale -> Fale
//   yale -> fale
function replaceYaleCaseSpecific(str) {
  // Order matters: uppercase first, then capitalized, then lowercase
  return str
    .replace(/YALE/g, 'FALE')
    .replace(/Yale/g, 'Fale')
    .replace(/yale/g, 'fale');
}

function replaceInTextNodes($) {
  $('body *')
    .contents()
    .filter(function () { return this.nodeType === 3; }) // text nodes
    .each(function () {
      const text = $(this).text();
      const newText = replaceYaleCaseSpecific(text);
      if (text !== newText) $(this).replaceWith(newText);
    });
}

// --- routes ---

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    const response = await axios.get(url, {
      responseType: 'text',
      transformResponse: (r) => r,
      headers: { 'User-Agent': 'Mozilla/5.0 (Faleproxy)' },
      validateStatus: () => true,
    });

    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    replaceInTextNodes($);

    if ($('title').length) {
      $('title').text(replaceYaleCaseSpecific($('title').text()));
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

// integration tests start this process and then POST to it
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Faleproxy server running at http://localhost:${PORT}`);
});
