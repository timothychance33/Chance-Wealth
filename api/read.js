// api/read.js — Chance Wealth screenshot reader
// Receives a base64 image from the app, reads it with the Anthropic API,
// returns a JSON array of accounts. The API key stays server-side.

export default async function handler(req, res) {
  // CORS + method guard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'API key not configured on server' });

  const { image, media_type } = req.body || {};
  if (!image) return res.status(400).json({ error: 'No image provided' });

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image } },
            { type: 'text', text: 'Extract every bank account visible in this screenshot. Respond with ONLY a JSON array and nothing else — no markdown, no backticks, no commentary: [{"name":"account name as shown","institution":"bank name if visible else empty string","type":"one of: checking, savings, money market, cd, investment, loan, credit","balance":1234.56}] Use the current/available balance shown. For loans use the outstanding balance owed as a positive number. If no accounts are visible, respond with []' }
          ]
        }]
      })
    });

    const data = await resp.json();
    if (data.error) return res.status(502).json({ error: data.error.message || 'reader error' });
    if (!resp.ok) return res.status(502).json({ error: 'reader request failed (' + resp.status + ')' });

    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return res.status(422).json({ error: 'no account data found in image' });

    let accounts;
    try { accounts = JSON.parse(m[0]); }
    catch (e) { return res.status(422).json({ error: 'could not parse account data' }); }

    return res.status(200).json({ accounts });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error: ' + err.message });
  }
}
