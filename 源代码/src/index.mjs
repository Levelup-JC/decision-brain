import "dotenv/config";
import { createServer } from "./server.mjs";

const port = Number(process.env.PORT || 4177);
const host = process.env.HOST || "0.0.0.0";

const server = createServer();

server.listen(port, host, () => {
  console.log(`Decision Brain listening on http://${host}:${port}`);
});
