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

// Generic helper for Render API
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
    throw new Error(`${method} ${path} → ${res.status}: ${txt}`);
  }
  return res.json().catch(() => ({}));
}

// Send message to Slack
async function sendSlack(responseUrl, text) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

// Trigger a deploy and return deploy id
async function triggerDeploy(serviceId, branch) {
  await renderFetch(`/services/${serviceId}`, "PATCH", { branch });
  const deploy = await renderFetch(`/services/${serviceId}/deploys`, "POST");
  return deploy.id;
}

// Wait for a deploy to finish, sending updates to Slack
async function waitForDeploy(serviceId, deployId, responseUrl, label) {
  let lastStatus = "";
  const start = Date.now();

  while (true) {
    const deploy = await renderFetch(`/services/${serviceId}/deploys/${deployId}`);
    const { status, commit } = deploy;

    if (status !== lastStatus) {
      await sendSlack(
        responseUrl,
        `📦 *${label}* → ${status.toUpperCase()} (commit: ${commit?.id || "?"})`
      );
      lastStatus = status;
    }

    if (status === "live") {
      const seconds = Math.round((Date.now() - start) / 1000);
      const url = label === "backend" ? BACKEND_PUBLIC_URL : FRONTEND_PUBLIC_URL;
      await sendSlack(
        responseUrl,
        `✅ *${label}* is LIVE after ${seconds}s → ${url}`
      );
      break;
    }

    if (["failed", "canceled", "deactivated"].includes(status)) {
      await sendSlack(responseUrl, `❌ *${label}* deployment ${status}`);
      break;
    }

    // wait 20s before polling again
    await new Promise((r) => setTimeout(r, 20000));
  }
}

app.post("/spin", async (req, res) => {
  const branch = (req.body.text || "").trim() || "main";
  const responseUrl = req.body.response_url;

  res.status(200).send(`🚀 Starting deploy for *${branch}*...`);

  try {
    // Deploy backend first
    await sendSlack(responseUrl, "🛠 Deploying *backend* first...");
    const backendDeployId = await triggerDeploy(BACKEND_SERVICE_ID, branch);
    await waitForDeploy(BACKEND_SERVICE_ID, backendDeployId, responseUrl, "backend");

    // Deploy frontend next
    await sendSlack(responseUrl, "🎨 Deploying *frontend*...");
    const frontendDeployId = await triggerDeploy(FRONTEND_SERVICE_ID, branch);
    await waitForDeploy(FRONTEND_SERVICE_ID, frontendDeployId, responseUrl, "frontend");

    // Final success message
    await sendSlack(
      responseUrl,
      `🎉 *${branch}* fully deployed!\nFrontend → ${FRONTEND_PUBLIC_URL}\nBackend → ${BACKEND_PUBLIC_URL}`
    );
  } catch (err) {
    console.error("Deploy error:", err);
    await sendSlack(responseUrl, `❌ Deploy failed: ${err.message}`);
  }
});

app.get("/", (_, res) => res.send("Spinner up ✅"));
app.listen(process.env.PORT || 3000, () => console.log("Spinner running..."));
