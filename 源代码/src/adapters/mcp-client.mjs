import { spawn } from "node:child_process";

function encodeMessage(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function extractTextContent(result) {
  const content = result?.content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (item?.type === "text") {
        return String(item.text || "");
      }
      return JSON.stringify(item);
    })
    .filter(Boolean)
    .join("\n");
}

export class McpClient {
  constructor({ command, args = [], env = process.env, cwd = process.cwd(), timeoutMs = 15000 }) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.cwd = cwd;
    this.timeoutMs = timeoutMs;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.nextId = 1;
    this.child = null;
  }

  async start() {
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.child.stdout.on("data", (chunk) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      if (process.env.DECISION_BRAIN_DEBUG_MCP === "1") {
        process.stderr.write(chunk);
      }
    });
    this.child.on("exit", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("MCP server exited before responding"));
      }
      this.pending.clear();
    });

    await this.request("initialize", {});
    return this;
  }

  handleStdout(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const separatorIndex = this.buffer.indexOf("\r\n\r\n");
      if (separatorIndex === -1) {
        return;
      }

      const headerText = this.buffer.slice(0, separatorIndex).toString("utf8");
      const contentLengthLine = headerText
        .split("\r\n")
        .find((line) => line.toLowerCase().startsWith("content-length:"));
      const contentLength = Number(contentLengthLine?.split(":")[1]?.trim() || 0);
      const bodyStart = separatorIndex + 4;

      if (!Number.isFinite(contentLength) || contentLength <= 0) {
        this.buffer = this.buffer.slice(bodyStart);
        continue;
      }

      if (this.buffer.length < bodyStart + contentLength) {
        return;
      }

      const body = this.buffer.slice(bodyStart, bodyStart + contentLength).toString("utf8");
      this.buffer = this.buffer.slice(bodyStart + contentLength);
      const parsed = JSON.parse(body);

      if (parsed.id !== undefined && this.pending.has(parsed.id)) {
        const pending = this.pending.get(parsed.id);
        this.pending.delete(parsed.id);
        if (parsed.error) {
          pending.reject(new Error(parsed.error.message || "MCP request failed"));
        } else {
          pending.resolve(parsed.result);
        }
      }
    }
  }

  request(method, params = {}) {
    if (!this.child) {
      throw new Error("MCP client has not been started");
    }

    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for MCP method ${method}`));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });

      this.child.stdin.write(encodeMessage({
        jsonrpc: "2.0",
        id,
        method,
        params
      }));
    });
  }

  async listTools() {
    const result = await this.request("tools/list", {});
    return result?.tools || [];
  }

  async callTool(name, args = {}) {
    const result = await this.request("tools/call", {
      name,
      arguments: args
    });
    return {
      raw: result,
      text: extractTextContent(result)
    };
  }

  close() {
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
  }
}
