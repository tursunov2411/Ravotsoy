import "dotenv/config";
import { createTelegramClient, readEnv, readOptionalEnv } from "../src/bots/shared.js";
import { formatAnalyticsForTelegram, getBusinessAnalytics, getSystemStatus } from "../src/services/businessOps.js";

const token = readEnv("MANAGER_BOT_TOKEN");
const ownerChatId = readOptionalEnv("OWNER_CHAT_ID", "CHAT_ID");

if (!ownerChatId) {
  throw new Error("OWNER_CHAT_ID or CHAT_ID is required");
}

const telegram = createTelegramClient(token);
const [analytics, systemStatus] = await Promise.all([
  getBusinessAnalytics("today"),
  getSystemStatus(),
]);

const text = [
  "Daily business summary",
  "",
  formatAnalyticsForTelegram(analytics),
  "",
  `System status: active ${systemStatus.activeResources}, pending ${systemStatus.pendingBookings}, awaiting confirmation ${systemStatus.awaitingConfirmation}`,
].join("\n");

await telegram.sendMessage(ownerChatId, text);
console.log("Daily report sent.");
