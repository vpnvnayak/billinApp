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

async function renderFetch(path, method = "GET", body) {
  const res = await fetch(`${RENDER_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json().catch(() => ({}));
}

// wait until deploy finishes
async function waitForDeploy(serviceId, deployId, responseUrl, label) {
  while (true) {
    const deploy = await renderFetch(`/services/${serviceId}/deploys/${deployId}`);
    const { status, commit, createdAt } = deploy;
    const text = `📦 *${label}* deploy: ${status} (commit: ${commit?.id || "unknown"})`;
    await sendSlackUpdate(responseUrl, text);

    if (status === "live" || status === "deactivated") {
      await sendSlackUpdate(
        responseUrl,
        status === "live"
          ? `✅ *${label}* is live!\nURL: ${
              label === "backend" ? BACKEND_PUBLIC_URL : FRONTEND_PUBLIC_URL
            }`
          : `❌ *${label}* deployment failed or stopped.`
      );
      break;
    }
    // check every 20s
    await new Promise((r) => setTimeout(r, 20000));
  }
}

async function triggerDeploy(serviceId, branch) {
  await renderFetch(`/services/${serviceId}`, "PATCH", { branch });
  const deploy = await renderFetch(`/services/${serviceId}/deploys`, "POST");
  return deploy.id;
}

async function sendSlackUpdate(url, text) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

app.post("/spin", async (req, res) => {
  const branch = (req.body.text || "").trim() || "main";
  const responseUrl = req.body.response_url;

  res.status(200).send(`🚀 Starting deploy for *${branch}*...`);

  try {
    // step 1 → backend first
    await sendSlackUpdate(responseUrl, "🛠 Deploying *backend* first...");
    const backendDeployId = await triggerDeploy(BACKEND_SERVICE_ID, branch);
    await waitForDeploy(BACKEND_SERVICE_ID, backendDeployId, responseUrl, "backend");

    // step 2 → frontend after backend
    await sendSlackUpdate(responseUrl, "🎨 Deploying *frontend*...");
    const frontendDeployId = await triggerDeploy(FRONTEND_SERVICE_ID, branch);
    await waitForDeploy(FRONTEND_SERVICE_ID, frontendDeployId, responseUrl, "frontend");

    // done
    await sendSlackUpdate(
      responseUrl,
      `🎉 *${branch}* fully deployed!\nFrontend → ${FRONTEND_PUBLIC_URL}\nBackend → ${BACKEND_PUBLIC_URL}`
    );
  } catch (err) {
    console.error("Error during deploy:", err);
    await sendSlackUpdate(responseUrl, `❌ Deploy failed: ${err.message}`);
  }
});

app.get("/", (_, res) => res.send("Spinner ready ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Spinner running on port", PORT));
