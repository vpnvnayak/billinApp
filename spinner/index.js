import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const {
  RENDER_API_KEY,
  FRONTEND_SERVICE_ID,
  BACKEND_SERVICE_ID,
  FRONTEND_PUBLIC_URL,
  BACKEND_PUBLIC_URL,
} = process.env;

const RENDER_API = "https://api.render.com/v1";

/* ---------- helpers ---------- */

async function sendSlack(url, text) {
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

function needEnv(name, val) {
  if (!val) throw new Error(`Missing env var: ${name}`);
}

async function renderFetch(path, method = "GET", body) {
  const res = await fetch(`${RENDER_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${method} ${path} → ${res.status} ${txt}`.slice(0, 1500));
  }
  // some endpoints legitimately return empty body
  try { return await res.json(); } catch { return {}; }
}

// get the most recent deploy for a service
async function getLatestDeployId(serviceId) {
  const list = await renderFetch(`/services/${serviceId}/deploys?limit=1`);
  const first = Array.isArray(list) ? list[0] : list?.data?.[0]; // handle either shape
  return first?.id;
}

async function triggerDeploy(serviceId, branch) {
  // set branch first
  await renderFetch(`/services/${serviceId}`, "PATCH", { branch });
  // then trigger deploy
  const d = await renderFetch(`/services/${serviceId}/deploys`, "POST");
  // API usually returns { id, ... }, but be defensive:
  if (d?.id) return d.id;

  // fallback: fetch latest deploy id
  const latestId = await getLatestDeployId(serviceId);
  if (!latestId) throw new Error(`No deploy id returned for service ${serviceId}`);
  return latestId;
}

// poll until live/failed and stream updates
async function waitForDeploy(serviceId, deployId, responseUrl, label) {
  let lastStatus = "";
  const start = Date.now();

  while (true) {
    const deploy = await renderFetch(`/services/${serviceId}/deploys/${deployId}`);
    const status = deploy?.status || "unknown";
    const commit = deploy?.commit?.id?.slice(0, 7) || "?";

    if (status !== lastStatus) {
      await sendSlack(responseUrl, `📦 ${label} → *${status.toUpperCase()}* (commit: ${commit})`);
      lastStatus = status;
    }

    if (status === "live") {
      const secs = Math.round((Date.now() - start) / 1000);
      const url = label === "backend" ? BACKEND_PUBLIC_URL : FRONTEND_PUBLIC_URL;
      await sendSlack(responseUrl, `✅ ${label} is LIVE after ${secs}s → ${url}`);
      return;
    }

    if (["failed", "canceled", "deactivated"].includes(status)) {
      throw new Error(`${label} deployment ${status}`);
    }

    await new Promise(r => setTimeout(r, 20000));
  }
}

/* ---------- routes ---------- */

app.post("/spin", async (req, res) => {
  const branch = (req.body.text || "").trim() || "main";
  const responseUrl = req.body.response_url;

  res.status(200).send(`🚀 Starting deploy for *${branch}*...`);

  try {
    // sanity checks
    needEnv("RENDER_API_KEY", RENDER_API_KEY);
    needEnv("BACKEND_SERVICE_ID", BACKEND_SERVICE_ID);
    needEnv("FRONTEND_SERVICE_ID", FRONTEND_SERVICE_ID);

    // 1) backend first
    await sendSlack(responseUrl, ":hammer_and_wrench: Deploying *backend* first...");
    const beId = await triggerDeploy(BACKEND_SERVICE_ID, branch);
    await waitForDeploy(BACKEND_SERVICE_ID, beId, responseUrl, "backend");

    // 2) frontend next
    await sendSlack(responseUrl, "🎨 Deploying *frontend*…");
    const feId = await triggerDeploy(FRONTEND_SERVICE_ID, branch);
    await waitForDeploy(FRONTEND_SERVICE_ID, feId, responseUrl, "frontend");

    await sendSlack(
      responseUrl,
      `🎉 *${branch}* fully deployed!\nFrontend → ${FRONTEND_PUBLIC_URL}\nBackend  → ${BACKEND_PUBLIC_URL}`
    );
  } catch (err) {
    console.error("Deploy error:", err);
    await sendSlack(responseUrl, `❌ Deploy failed: ${err.message?.slice(0, 1200)}`);
  }
});

app.get("/", (_req, res) => res.send("Spinner ready ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Spinner running on port", PORT));
