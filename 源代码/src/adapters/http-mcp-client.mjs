/**
 * HTTP MCP Client for market-data MCP server and other HTTP-transport MCP servers.
 *
 * Supports the Streamable HTTP transport (MCP spec 2025-03-26+).
 * Used to connect to Bitget's market-data MCP at https://datahub.noxiaohao.com/mcp
 * which provides 20 public data tools — no API key required.
 */

const MCP_SESSION_HEADER = "mcp-session-id";

export class HttpMcpClient {
  constructor({ url, timeoutMs = 30000, headers = {}, retryCount = 0, retryDelayMs = 500 }) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.sessionId = null;
    this.extraHeaders = headers;
    this.nextId = 1;
    this.initialized = false;
    this.retryCount = retryCount;
    this.retryDelayMs = retryDelayMs;
  }

  async _fetchOnce(method, params = {}) {
    const id = this.nextId++;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    const reqHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...this.extraHeaders,
    };

    if (this.sessionId) {
      reqHeaders[MCP_SESSION_HEADER] = this.sessionId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: reqHeaders,
        body,
        signal: controller.signal,
      });

      // Extract session ID from response header
      const newSessionId = response.headers.get(MCP_SESSION_HEADER);
      if (newSessionId) {
        this.sessionId = newSessionId;
      }

      const text = await response.text();

      // Parse SSE-wrapped response (Streamable HTTP)
      // Format: "event: message\ndata: <JSON>\n\n"
      const dataMatch = text.match(/data:\s*(\{.*\})/s);
      if (!dataMatch) {
        throw new Error(`Failed to parse MCP response: ${text.slice(0, 200)}`);
      }

      const result = JSON.parse(dataMatch[1]);

      if (result.error) {
        throw new Error(
          `MCP error: ${result.error.message || JSON.stringify(result.error)}`
        );
      }

      return result.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async _fetch(method, params = {}) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        return await this._fetchOnce(method, params);
      } catch (error) {
        lastError = error;
        if (attempt >= this.retryCount) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * (attempt + 1)));
      }
    }

    throw lastError;
  }

  async start() {
    // Initialize MCP session
    const initResult = await this._fetch("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "decision-brain",
        version: "1.0.0",
      },
    });

    this.serverInfo = initResult.serverInfo;
    this.serverCapabilities = initResult.capabilities;
    this.initialized = true;

    return this;
  }

  async listTools() {
    const result = await this._fetch("tools/list", {});
    return result?.tools || [];
  }

  async callTool(name, args = {}) {
    const result = await this._fetch("tools/call", {
      name,
      arguments: args,
    });

    // Extract text content from MCP response
    const content = result?.content;
    if (!Array.isArray(content)) {
      return { raw: result, text: JSON.stringify(result) };
    }

    const text = content
      .map((item) => {
        if (item?.type === "text") return String(item.text || "");
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join("\n");

    return { raw: result, text };
  }

  close() {
    // HTTP MCP doesn't need explicit close — session expires server-side
    this.sessionId = null;
    this.initialized = false;
  }
}
