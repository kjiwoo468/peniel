// Minimal Express server to proxy LLM requests for the devotional generator
// Usage: set OPENAI_API_KEY or OPENROUTER_API_KEY and (optionally) OPENAI_MODEL env vars, then `node server.js`

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const dotenv = require('dotenv');
const app = express();
const PORT = process.env.PORT || 3000;

// Load environment variables from .env file
dotenv.config();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Support both OpenAI and OpenRouter
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const USE_OPENROUTER = !!OPENROUTER_KEY; // Prefer OpenRouter if key is provided
const API_KEY = USE_OPENROUTER ? OPENROUTER_KEY : OPENAI_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// API configuration
const API_BASE_URL = USE_OPENROUTER 
  ? 'https://openrouter.ai/api/v1' 
  : 'https://api.openai.com/v1';
const API_HEADERS = USE_OPENROUTER
  ? {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://peniel.devotional.app', // Optional but recommended
      'X-Title': 'Peniel Devotional Generator' // Optional but recommended
    }
  : {
      'Authorization': `Bearer ${OPENAI_KEY}`
    };

if (!API_KEY) {
  console.warn('Warning: Neither OPENAI_API_KEY nor OPENROUTER_API_KEY is set. LLM endpoint will return an error until you provide a key.');
}

app.post('/api/generate-devotional', async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: 'Server missing API key (OPENAI_API_KEY or OPENROUTER_API_KEY)' });
  const { topic, topicKey, length } = req.body || {};
  if (!topic || !length) return res.status(400).json({ error: 'Missing topic or length' });

  // Build a prompt requesting JSON output
  const userPrompt = `Create a ${length}-day devotional plan for the topic: ${topic}.\n\n` +
    `For each day, produce JSON with keys: day (1-based), heading, scripture (short ref), evidence (one paragraph summarizing relevant extra-biblical evidence and sources), viewpoints (an array of {title, detail} with 2-4 items, each a 1-2 sentence explanation), and reflectionPrompt (one short question).\n\n` +
    `Return ONLY valid JSON in the shape: { "days": [ { ... }, ... ], "topic": "${topic}" }`; 

  try {
    const apiResp = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...API_HEADERS
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that outputs structured JSON only.' },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1400,
        temperature: 0.8
      })
    });

    if (!apiResp.ok) {
      const txt = await apiResp.text();
      return res.status(502).json({ error: 'LLM call failed', detail: txt });
    }

    const j = await apiResp.json();
    const content = j.choices && j.choices[0] && (j.choices[0].message?.content || j.choices[0].text);
    if (!content) return res.status(502).json({ error: 'No content from LLM' });

    // Try to parse JSON from the model's output
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // attempt to extract JSON substring
      const m = content.match(/\{[\s\S]*\}$/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch (e2) { parsed = null; }
      }
    }

    if (!parsed) {
      return res.status(502).json({ error: 'Could not parse LLM output as JSON', raw: content });
    }

    return res.json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
