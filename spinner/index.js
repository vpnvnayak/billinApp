import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const {
  RENDER_API_KEY,
  BACKEND_SERVICE_ID,
  FRONTEND_SERVICE_ID,
  BACKEND_PUBLIC_URL,
  FRONTEND_PUBLIC_URL,
} = process.env;

const RENDER_API = "https://api.render.com/v1";
const POLL_INTERVAL_MS = 15000;   // 15s
const WATCHDOG_MS = 30 * 60 * 1000; // 30 min safety timeout

/* ----------------- helpers ----------------- */

async function sendSlack(url, text) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    // don't crash if Slack fails; just log
    console.error("sendSlack error:", e?.message || e);
  }
}

function required(name, val) {
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
    throw new Error(`${method} ${path} → ${res.status}\n${txt}`.slice(0, 1800));
  }
  try {
    return await res.json();
  } catch {
    return {}; // tolerate empty bodies
  }
}

async function getService(serviceId) {
  return renderFetch(`/services/${serviceId}`);
}

async function listDeploys(serviceId, limit = 5) {
  const list = await renderFetch(`/services/${serviceId}/deploys?limit=${limit}`);
  return Array.isArray(list) ? list : (list?.data || []);
}

async function getLatestDeployId(serviceId) {
  const arr = await listDeploys(serviceId, 1);
  return arr[0]?.id;
}

async function triggerDeploy(serviceId, branch, responseUrl, label) {
  // Introspect service
  const svc = await getService(serviceId);
  const svcType = svc?.type || "unknown";
  const currentBranch = svc?.branch || "unknown";
  await sendSlack(responseUrl, `ℹ️ ${label} service: *${svcType}*, current branch: \`${currentBranch}\``);

  // Update branch only if needed
  if (currentBranch !== branch) {
    await sendSlack(responseUrl, `🔧 Setting ${label} branch → \`${branch}\``);
    await renderFetch(`/services/${serviceId}`, "PATCH", { branch });
  } else {
    await sendSlack(responseUrl, `↔️ ${label} already on branch \`${branch}\``);
  }

  // Trigger deploy
  await sendSlack(responseUrl, `🚀 Triggering ${label} deploy…`);
  const resp = await renderFetch(`/services/${serviceId}/deploys`, "POST");

  // POST often returns { id }, but be defensive
  let id = resp?.id || resp?.deploy?.id;
  if (!id) {
    await sendSlack(responseUrl, `⚠️ No deploy id returned for ${label}. Trying latest…`);
    id = await getLatestDeployId(serviceId);
  }
  if (!id) throw new Error(`${label}: could not determine deploy id (keys: ${Object.keys(resp || {}).join(", ")})`);

  await sendSlack(responseUrl, `🆔 ${label} deploy id: \`${id}\``);
  return id;
}

async function waitForDeploy(serviceId, deployId, responseUrl, label, liveUrl) {
  let lastStatus = "";
  const start = Date.now();

  await sendSlack(responseUrl, `👀 Polling ${label} status for deploy \`${deployId}\`…`);

  // if fetching this deploy id fails repeatedly, switch to "track latest" mode
  let consecutiveErrors = 0;
  let trackingMode = "by-id"; // or "latest"

  while (true) {
    if (Date.now() - start > WATCHDOG_MS) {
      throw new Error(`${label}: watchdog timeout after ${Math.round(WATCHDOG_MS / 60000)}m`);
    }

    try {
      let dep;
      if (trackingMode === "by-id") {
        dep = await renderFetch(`/services/${serviceId}/deploys/${deployId}`);
      } else {
        // latest mode: pick newest deploy and follow that
        const arr = await listDeploys(serviceId, 1);
        dep = arr[0];
        if (dep?.id && dep.id !== deployId) {
          // update to the newest deploy id if it changed
          deployId = dep.id;
          await sendSlack(responseUrl, `🔄 ${label}: switched to new deploy id \`${deployId}\` (latest mode)`);
        }
      }

      const status = dep?.status || "unknown";
      const commit7 = dep?.commit?.id ? dep.commit.id.slice(0, 7) : "?";

      if (status !== lastStatus) {
        await sendSlack(responseUrl, `📦 ${label} → *${status.toUpperCase()}* (commit: ${commit7})`);
        lastStatus = status;
      }

      if (status === "live") {
        const secs = Math.round((Date.now() - start) / 1000);
        await sendSlack(responseUrl, `✅ ${label} is LIVE after ${secs}s → ${liveUrl}`);
        return;
      }
      if (["failed", "canceled", "deactivated"].includes(status)) {
        throw new Error(`${label} deployment ${status}`);
      }

      consecutiveErrors = 0; // reset on success
    } catch (e) {
      consecutiveErrors += 1;
      await sendSlack(responseUrl, `⚠️ ${label} poll error (#${consecutiveErrors}): ${e.message.split("\n")[0]}`);
      if (consecutiveErrors >= 2 && trackingMode === "by-id") {
        // switch to tracking latest deploy after repeated failures
        trackingMode = "latest";
        await sendSlack(responseUrl, `🧭 ${label}: switching to track *latest* deploy until LIVE…`);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/* ----------------- routes ----------------- */

app.post("/spin", async (req, res) => {
  const branch = (req.body.text || "").trim() || "main";
  const responseUrl = req.body.response_url;
  res.status(200).send(`🚀 Starting deploy for *${branch}*…`);

  try {
    required("RENDER_API_KEY", RENDER_API_KEY);
    required("BACKEND_SERVICE_ID", BACKEND_SERVICE_ID);
    required("FRONTEND_SERVICE_ID", FRONTEND_SERVICE_ID);

    // 1) Backend first
    await sendSlack(responseUrl, ":hammer_and_wrench: Deploying *backend* first…");
    const beId = await triggerDeploy(BACKEND_SERVICE_ID, branch, responseUrl, "backend");
    await waitForDeploy(BACKEND_SERVICE_ID, beId, responseUrl, "backend", BACKEND_PUBLIC_URL);

    // 2) Frontend next
    await sendSlack(responseUrl, "🎨 Deploying *frontend*…");
    const feId = await triggerDeploy(FRONTEND_SERVICE_ID, branch, responseUrl, "frontend");
    await waitForDeploy(FRONTEND_SERVICE_ID, feId, responseUrl, "frontend", FRONTEND_PUBLIC_URL);

    await sendSlack(
      responseUrl,
      `🎉 *${branch}* fully deployed!\nFrontend → ${FRONTEND_PUBLIC_URL}\nBackend  → ${BACKEND_PUBLIC_URL}`
    );
  } catch (err) {
    console.error("Spinner error:", err);
    await sendSlack(responseUrl, `❌ Deploy failed:\n${err.message}`);
  }
});

app.get("/", (_req, res) => res.send("Spinner ready ✅"));
app.listen(process.env.PORT || 3000, () => console.log("spinner running"));
