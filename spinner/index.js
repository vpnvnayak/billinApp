import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Environment variables ---
const {
  RENDER_API_KEY,
  BACKEND_SERVICE_ID,
  FRONTEND_SERVICE_ID,
  BACKEND_PUBLIC_URL,
  FRONTEND_PUBLIC_URL,
} = process.env;

const RENDER_API = "https://api.render.com/v1";

// ---------- Helpers ----------
async function sendSlack(url, text) {
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
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
    return {};
  }
}

async function getService(serviceId) {
  return renderFetch(`/services/${serviceId}`);
}

async function getLatestDeployId(serviceId) {
  const list = await renderFetch(`/services/${serviceId}/deploys?limit=1`);
  const arr = Array.isArray(list) ? list : list?.data || [];
  return arr[0]?.id;
}

async function triggerDeploy(serviceId, branch, responseUrl, label) {
  const svc = await getService(serviceId);
  const svcType = svc?.type || "unknown";
  const currentBranch = svc?.branch || "unknown";
  await sendSlack(responseUrl, `ℹ️ ${label} service: *${svcType}*, current branch: \`${currentBranch}\``);

  // Update branch if needed
  if (currentBranch !== branch) {
    await sendSlack(responseUrl, `🔧 Setting ${label} branch → \`${branch}\``);
    await renderFetch(`/services/${serviceId}`, "PATCH", { branch });
  } else {
    await sendSlack(responseUrl, `↔️ ${label} already on branch \`${branch}\``);
  }

  await sendSlack(responseUrl, `🚀 Triggering ${label} deploy…`);
  const resp = await renderFetch(`/services/${serviceId}/deploys`, "POST");
  const id = resp?.id || resp?.deploy?.id || (await getLatestDeployId(serviceId));
  if (!id) throw new Error(`${label}: could not determine deploy id`);
  await sendSlack(responseUrl, `🆔 ${label} deploy id: \`${id}\``);
  return id;
}

async function waitForDeploy(serviceId, deployId, responseUrl, label, liveUrl) {
  let last = "";
  const start = Date.now();

  while (true) {
    const dep = await renderFetch(`/services/${serviceId}/deploys/${deployId}`);
    const status = dep?.status || "unknown";
    const commit7 = dep?.commit?.id ? dep.commit.id.slice(0, 7) : "?";

    if (status !== last) {
      await sendSlack(responseUrl, `📦 ${label} → *${status.toUpperCase()}* (commit: ${commit7})`);
      last = status;
    }

    if (status === "live") {
      const secs = Math.round((Date.now() - start) / 1000);
      await sendSlack(responseUrl, `✅ ${label} is LIVE after ${secs}s → ${liveUrl}`);
      return;
    }

    if (["failed", "canceled", "deactivated"].includes(status)) {
      await sendSlack(
        responseUrl,
        `❌ ${label} deployment ${status}. Check Render logs for port binding (must listen on 0.0.0.0:$PORT).`
      );
      throw new Error(`${label} deployment ${status}`);
    }

    await new Promise((r) => setTimeout(r, 15000)); // 15s polling
  }
}

// ---------- Main /spin ----------
app.post("/spin", async (req, res) => {
  const branch = (req.body.text || "").trim() || "main";
  const responseUrl = req.body.response_url;
  res.status(200).send(`🚀 Starting deploy for *${branch}*…`);

  try {
    required("RENDER_API_KEY", RENDER_API_KEY);
    required("BACKEND_SERVICE_ID", BACKEND_SERVICE_ID);
    required("FRONTEND_SERVICE_ID", FRONTEND_SERVICE_ID);

    // 1️⃣ Backend
    await sendSlack(responseUrl, ":hammer_and_wrench: Deploying *backend* first…");
    const beId = await triggerDeploy(BACKEND_SERVICE_ID, branch, responseUrl, "backend");
    await waitForDeploy(BACKEND_SERVICE_ID, beId, responseUrl, "backend", BACKEND_PUBLIC_URL);

    // 2️⃣ Frontend
    await sendSlack(responseUrl, "🎨 Deploying *frontend*…");
    const feId = await triggerDeploy(FRONTEND_SERVICE_ID, branch, responseUrl, "frontend");
    await waitForDeploy(FRONTEND_SERVICE_ID, feId, responseUrl, "frontend", FRONTEND_PUBLIC_URL);

    // ✅ Done
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
