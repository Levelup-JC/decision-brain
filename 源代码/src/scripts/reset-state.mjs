import { store } from "../data-store.mjs";

await store.clear();
process.stdout.write("Decision Brain state has been reset.\n");
