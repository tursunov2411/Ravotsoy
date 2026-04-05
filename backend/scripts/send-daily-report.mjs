import "dotenv/config";
import { createTelegramClient, readEnv, readOptionalEnv } from "../src/bots/shared.js";
import { buildDailyReportMessage, getDailyReportRecipients } from "../src/services/businessOps.js";

const token = readEnv("MANAGER_BOT_TOKEN");
const telegram = createTelegramClient(token);
const recipients = await getDailyReportRecipients();
const fallbackChatId = readOptionalEnv("OWNER_CHAT_ID", "CHAT_ID");
const text = await buildDailyReportMessage();

if (recipients.length === 0 && !fallbackChatId) {
  throw new Error("No linked report recipients and no OWNER_CHAT_ID fallback found.");
}

let sentCount = 0;

for (const recipient of recipients) {
  await telegram.sendMessage(recipient.telegramChatId, text);
  sentCount += 1;
}

if (sentCount === 0 && fallbackChatId) {
  await telegram.sendMessage(fallbackChatId, text);
  sentCount += 1;
}

console.log(`Daily report sent to ${sentCount} recipient(s).`);
