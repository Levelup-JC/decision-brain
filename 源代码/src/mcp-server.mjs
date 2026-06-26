import { callTool, listTools } from "./service-contract.mjs";

function writeMessage(message) {
  const body = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
  process.stdout.write(header);
  process.stdout.write(body);
}

async function handleMessage(message) {
  if (message.method === "initialize") {
    writeMessage({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        serverInfo: {
          name: "decision-brain",
          version: "0.1.0"
        },
        capabilities: {
          tools: {}
        }
      }
    });
    return;
  }

  if (message.method === "notifications/initialized") {
    return;
  }

  if (message.method === "tools/list") {
    writeMessage({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools: listTools()
      }
    });
    return;
  }

  if (message.method === "tools/call") {
    try {
      const name = message.params?.name;
      const args = message.params?.arguments || {};
      const result = await callTool(name, args);
      writeMessage({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      });
    } catch (error) {
      writeMessage({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : "Tool call failed"
        }
      });
    }
    return;
  }

  if (message.id !== undefined) {
    writeMessage({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32601,
        message: `Unknown method: ${message.method}`
      }
    });
  }
}

function parseHeaders(headerText) {
  const headers = {};
  for (const line of headerText.split("\r\n")) {
    if (!line.trim()) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    headers[key] = value;
  }
  return headers;
}

let buffer = Buffer.alloc(0);

process.stdin.on("data", async (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const separatorIndex = buffer.indexOf("\r\n\r\n");
    if (separatorIndex === -1) {
      return;
    }

    const headerText = buffer.slice(0, separatorIndex).toString("utf8");
    const headers = parseHeaders(headerText);
    const contentLength = Number(headers["content-length"] || 0);
    const bodyStart = separatorIndex + 4;

    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      buffer = buffer.slice(bodyStart);
      continue;
    }

    if (buffer.length < bodyStart + contentLength) {
      return;
    }

    const body = buffer.slice(bodyStart, bodyStart + contentLength).toString("utf8");
    buffer = buffer.slice(bodyStart + contentLength);

    try {
      const message = JSON.parse(body);
      await handleMessage(message);
    } catch (error) {
      writeMessage({
        jsonrpc: "2.0",
        error: {
          code: -32700,
          message: error instanceof Error ? error.message : "Parse error"
        }
      });
    }
  }
});
