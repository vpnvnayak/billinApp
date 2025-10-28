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
const POLL_INTERVAL_MS = 15000;

/* ----------------- helpers ----------------- */
async function sendSlack(responseUrl, text) {
  if (!responseUrl) return;
  try {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("sendSlack error:", e?.message || e);
  }
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
    throw new Error(`${method} ${path} → ${res.status} ${txt.slice(0, 400)}`);
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

async function listDeploys(serviceId, limit = 1) {
  const out = await renderFetch(`/services/${serviceId}/deploys?limit=${limit}`);
  return Array.isArray(out) ? out : out?.data || [];
}

/* ----------------- main actions ----------------- */
async function deployService(serviceId, label, branch, responseUrl, liveUrl) {
  await sendSlack(responseUrl, `🚀 Starting *${label}* deploy on branch \`${branch}\`…`);

  const svc = await getService(serviceId);
  const currentBranch = svc?.branch || "unknown";
  if (currentBranch !== branch) {
    await renderFetch(`/services/${serviceId}`, "PATCH", { branch });
    await sendSlack(responseUrl, `🔧 ${label} branch set → \`${branch}\``);
  } else {
    await sendSlack(responseUrl, `↔️ ${label} already on \`${branch}\``);
  }

  const d = await renderFetch(`/services/${serviceId}/deploys`, "POST");
  const id = d?.id || d?.deploy?.id;
  if (!id) throw new Error(`No deploy ID returned for ${label}`);
  await sendSlack(responseUrl, `🆔 ${label} deploy id: ${id}`);

  let last = "";
  while (true) {
    const dep = await renderFetch(`/services/${serviceId}/deploys/${id}`);
    const status = dep?.status || "unknown";
    if (status !== last) {
      const commit7 = dep?.commit?.id ? dep.commit.id.slice(0, 7) : "?";
      await sendSlack(responseUrl, `📦 ${label} → *${status.toUpperCase()}* (commit: ${commit7})`);
      last = status;
    }
    if (status === "live") {
      await sendSlack(responseUrl, `✅ ${label} is LIVE → ${liveUrl}`);
      return;
    }
    if (["failed", "canceled", "deactivated"].includes(status)) {
      throw new Error(`${label} deploy ${status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function stopService(serviceId, label, responseUrl) {
  await sendSlack(responseUrl, `🛑 Stopping *${label}*…`);
  await renderFetch(`/services/${serviceId}`, "PATCH", { suspended: true });
  await sendSlack(responseUrl, `✅ *${label}* stopped (suspended).`);
}

async function statusService(serviceId, label, liveUrl) {
  const svc = await getService(serviceId);
  const deploys = await listDeploys(serviceId, 1);
  const lastDep = deploys[0];
  const type = svc?.type || "unknown";
  const branch = svc?.branch || "unknown";
  const suspended = !!svc?.suspended;
  const state = suspended ? "🟥 stopped (suspended)" : "🟩 running";

  const depStatus = lastDep?.status || "unknown";
  const depCommit = lastDep?.commit?.id ? lastDep.commit.id.slice(0, 7) : "?";
  const depWhen = lastDep?.createdAt || lastDep?.updatedAt || "";

  let msg = `• *${label}* (${type})\n`;
  msg += `  ↳ Branch: \`${branch}\`\n`;
  msg += `  ↳ Status: ${state}\n`;
  msg += `  ↳ Latest deploy: ${depStatus} (commit: ${depCommit})\n`;
  if (depWhen) msg += `  ↳ Updated: ${depWhen}\n`;
  if (liveUrl) msg += `  ↳ URL: ${liveUrl}\n`;
  return msg;
}

/* ----------------- Slack route ----------------- */
app.post("/spin", async (req, res) => {
  const text = (req.body.text || "").trim();
  const responseUrl = req.body.response_url;
  res.status(200).send("processing command…");

  try {
    const parts = text.split(/\s+/).filter(Boolean);
    const action = (parts[0] || "").toLowerCase(); // start | stop | status
    const target = (parts[1] || "").toLowerCase(); // backend | frontend | all
    const branch = parts[2] || "main";

    if (!["start", "stop", "status"].includes(action)) {
      return sendSlack(
        responseUrl,
        "⚠️ Usage:\n• `/spin start backend|frontend <branch>`\n• `/spin stop backend|frontend`\n• `/spin status backend|frontend|all`"
      );
    }

    if (action === "status" && target === "all") {
      const beMsg = await statusService(BACKEND_SERVICE_ID, "backend", BACKEND_PUBLIC_URL);
      const feMsg = await statusService(FRONTEND_SERVICE_ID, "frontend", FRONTEND_PUBLIC_URL);
      return sendSlack(responseUrl, `📊 *Overall Status:*\n${beMsg}\n${feMsg}`);
    }

    if (!["backend", "frontend"].includes(target)) {
      return sendSlack(responseUrl, "⚠️ Target must be `backend`, `frontend`, or `all` (for status)");
    }

    const serviceId = target === "backend" ? BACKEND_SERVICE_ID : FRONTEND_SERVICE_ID;
    const liveUrl = target === "backend" ? BACKEND_PUBLIC_URL : FRONTEND_PUBLIC_URL;

    if (action === "start") {
      await deployService(serviceId, target, branch, responseUrl, liveUrl);
    } else if (action === "stop") {
      await stopService(serviceId, target, responseUrl);
    } else if (action === "status") {
      const msg = await statusService(serviceId, target, liveUrl);
      await sendSlack(responseUrl, msg);
    }
  } catch (err) {
    console.error("spin error:", err);
    await sendSlack(responseUrl, `❌ command failed: ${err.message}`);
  }
});

app.get("/", (_req, res) => res.send("Spinner ready ✅"));
app.listen(process.env.PORT || 3000, () => console.log("spinner running"));
