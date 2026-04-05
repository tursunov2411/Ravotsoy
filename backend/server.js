import dotenv from "dotenv";

dotenv.config();

import { startTelegramWebhookServer } from "./src/telegramWebhookServer.js";

startTelegramWebhookServer();
