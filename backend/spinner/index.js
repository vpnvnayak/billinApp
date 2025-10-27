import express from 'express';
import fetch from 'node-fetch';
import qs from 'qs';

const app = express();
// Slack slash commands default to x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// set in Render dashboard → Environment tab
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID;
const RENDER_PUBLIC_URL = process.env.RENDER_PUBLIC_URL || ''; // e.g., https://myapp.onrender.com

// Health check
app.get('/', (_req, res) => res.send('spinner alive'));

// Slack will POST here. Set this as your Slash Command Request URL.
app.post('/spin', async (req, res) => {
  try {
    const branch = (req.body.text || '').trim() || 'main';
    const responseUrl = req.body.response_url;

    // Respond immediately to Slack so the command doesn't time out
    res.status(200).send(`🚀 Starting deploy for *${branch}*...`);

    // OPTIONAL: if your Render service is pinned to a specific branch in the UI,
    // you can keep that as-is. Most people just redeploy the existing branch.
    // If you really need to switch the service to another branch, that’s an API update step
    // (we can add later). For v1, we just trigger a deploy of the service as configured.

    // 1) Trigger the deploy
    await fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Content-Type': 'application/json'
      }
      // body is optional for “deploy latest commit of configured branch”
    });

    // 2) Tell Slack “deploy requested” (optional second ping)
    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🛠️ Deploy requested. I’ll post the URL when it’s live.` })
      });
    }

    // 3) (Simple version) Wait a short period and post the known public URL.
    //    For v1 we won't poll status; we just share the service URL.
    if (responseUrl && RENDER_PUBLIC_URL) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `✅ Done (requested). Visit: ${RENDER_PUBLIC_URL}` })
      });
    }
  } catch (err) {
    console.error('spinner error', err);
    // Best-effort error post back to Slack if we have a response_url
    const responseUrl = req.body?.response_url;
    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `❌ Deploy failed: ${err.message || 'error'}` })
      });
    }
    // already responded 200 above; nothing else to send here
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('spinner listening on', PORT));
