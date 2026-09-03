import { FirestoreInsightRepository } from "./data/firestore-insight-repository.js";
import { InsightService } from "./services/insight-service.js";

import { createApp } from "./app.js";
import { FirebaseTokenVerifier } from "./auth/firebase-token-verifier.js";
import { loadConfig } from "./config/env.js";
import { FirestoreJournalRepository } from "./data/firestore-journal-repository.js";
import { FirestoreSignalRepository } from "./data/firestore-signal-repository.js";
import { GeminiConversationModel } from "./services/conversation-model.js";
import { JournalService } from "./services/journal-service.js";
import { SignalService } from "./services/signal-service.js";
import { GoogleSecretProvider } from "./services/secret-provider.js";

const config = loadConfig();
const verifier = new FirebaseTokenVerifier(config);
const repository = new FirestoreJournalRepository();
const signalRepo = new FirestoreSignalRepository();
const secrets = new GoogleSecretProvider(config);
const model = new GeminiConversationModel(config, secrets);
const journalService = new JournalService(repository, model);
const signalService = new SignalService(signalRepo, repository);
const insightRepo = new FirestoreInsightRepository();
const insightService = new InsightService(insightRepo, signalRepo);

const app = await createApp({ config, verifier, journalService, signalService, insightService });

const server = app.listen(3000, "0.0.0.0", () => {
  console.log(JSON.stringify({ severity: "INFO", event: "server_started", port: 3000 }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ severity: "INFO", event: "server_stopping", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
