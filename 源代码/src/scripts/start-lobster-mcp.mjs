import { homedir } from "node:os";
import { join } from "node:path";

process.env.DECISION_BRAIN_DATA_DIR ||= join(homedir(), ".decision-brain-lobster");

await import("../mcp-server.mjs");
