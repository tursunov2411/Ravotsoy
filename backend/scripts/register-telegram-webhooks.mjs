import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(backendRoot, "..");

function readFrontendEnvValue(name) {
  const envPath = path.join(repoRoot, "frontend", ".env");

  if (!fs.existsSync(envPath)) {
    return "";
  }

  const rows = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const row of rows) {
    const match = row.match(/^\s*([^#=]+)=(.*)$/);

    if (match && match[1].trim() === name) {
      return match[2].trim();
    }
  }

  return "";
}

function readEnv(name, fallback = "") {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  return fallback;
}

function requireEnv(name, fallback = "") {
  const value = readEnv(name, fallback);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function telegramCall(token, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(`${method} failed: ${result.description || response.statusText}`);
  }

  return result.result;
}

const backendUrl =
  readEnv("BACKEND_PUBLIC_URL")
  || readFrontendEnvValue("VITE_BACKEND_URL");
const customerToken = requireEnv("CUSTOMER_BOT_TOKEN");
const managerToken = requireEnv("MANAGER_BOT_TOKEN");

const customerCommands = [
  { command: "start", description: "Asosiy menyu" },
  { command: "book", description: "Bron boshlash" },
  { command: "resources", description: "Mavjud joylar" },
  { command: "contact", description: "Aloqa" },
  { command: "help", description: "Yordam" },
];

const managerCommands = [
  { command: "start", description: "Manager bot holati" },
];

if (!backendUrl) {
  throw new Error("BACKEND_PUBLIC_URL or frontend/.env VITE_BACKEND_URL is required");
}

const normalizedBackendUrl = backendUrl.replace(/\/+$/, "");

await telegramCall(customerToken, "setWebhook", {
  url: `${normalizedBackendUrl}/webhook/customer`,
  drop_pending_updates: false,
  allowed_updates: ["message", "callback_query"],
});

await telegramCall(managerToken, "setWebhook", {
  url: `${normalizedBackendUrl}/webhook/manager`,
  drop_pending_updates: false,
  allowed_updates: ["message", "callback_query"],
});

await telegramCall(customerToken, "setMyCommands", {
  commands: customerCommands,
  scope: { type: "default" },
});

await telegramCall(managerToken, "setMyCommands", {
  commands: managerCommands,
  scope: { type: "default" },
});

const [customerInfo, managerInfo] = await Promise.all([
  telegramCall(customerToken, "getWebhookInfo", {}),
  telegramCall(managerToken, "getWebhookInfo", {}),
]);

console.log(
  JSON.stringify(
    {
      backendUrl: normalizedBackendUrl,
      customer: {
        webhook: customerInfo.url,
        pendingUpdates: customerInfo.pending_update_count ?? 0,
      },
      manager: {
        webhook: managerInfo.url,
        pendingUpdates: managerInfo.pending_update_count ?? 0,
      },
    },
    null,
    2,
  ),
);
