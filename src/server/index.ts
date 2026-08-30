import { createApp } from "./app.js";
import { FirebaseTokenVerifier } from "./auth/firebase-token-verifier.js";
import { loadConfig } from "./config/env.js";
import { FirestoreJournalRepository } from "./data/firestore-journal-repository.js";
import { GeminiConversationModel } from "./services/conversation-model.js";
import { JournalService } from "./services/journal-service.js";
import { GoogleSecretProvider } from "./services/secret-provider.js";

const config = loadConfig();
const verifier = new FirebaseTokenVerifier(config);
const repository = new FirestoreJournalRepository();
const secrets = new GoogleSecretProvider(config);
const model = new GeminiConversationModel(config, secrets);
const journalService = new JournalService(repository, model);
const app = await createApp({ config, verifier, journalService });

const PORT = 3000;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ severity: "INFO", event: "server_started", port: PORT }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ severity: "INFO", event: "server_stopping", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
