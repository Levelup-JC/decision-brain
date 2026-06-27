/**
 * HTTP MCP Client for market-data MCP server and other HTTP-transport MCP servers.
 *
 * Supports the Streamable HTTP transport (MCP spec 2025-03-26+).
 * Used to connect to Bitget's market-data MCP at https://datahub.noxiaohao.com/mcp
 * which provides 20 public data tools — no API key required.
 */

const MCP_SESSION_HEADER = "mcp-session-id";

export class HttpMcpClient {
  constructor({ url, timeoutMs = 30000, headers = {}, retryCount = 0, retryDelayMs = 300, maxConcurrent = 5 }) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.sessionId = null;
    this.extraHeaders = headers;
    this.nextId = 1;
    this.initialized = false;
    this.retryCount = retryCount;
    this.retryDelayMs = retryDelayMs;
    this._maxConcurrent = maxConcurrent;
    this._inFlight = 0;
    this._waitQueue = [];
  }

  async _fetchOnce(method, params = {}) {
    await this._acquireSlot();

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
      this._releaseSlot();
    }
  }

  async _fetch(method, params = {}, { trackRetries = false } = {}) {
    let lastError = null;
    let totalAttempts = 0;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        const result = await this._fetchOnce(method, params);
        return trackRetries ? { result, retryCount: attempt } : result;
      } catch (error) {
        lastError = error;
        totalAttempts = attempt + 1;
        if (attempt >= this.retryCount) {
          break;
        }

        const delay = this.retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    lastError.retryCount = totalAttempts - 1;
    lastError.retriesExhausted = true;
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
    const { result, retryCount = 0 } = await this._fetch(
      "tools/call",
      { name, arguments: args },
      { trackRetries: true }
    );

    // Extract text content from MCP response
    const content = result?.content;
    if (!Array.isArray(content)) {
      return { raw: result, text: JSON.stringify(result), retryCount };
    }

    const text = content
      .map((item) => {
        if (item?.type === "text") return String(item.text || "");
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join("\n");

    return { raw: result, text, retryCount };
  }

  async _acquireSlot() {
    if (this._inFlight < this._maxConcurrent) {
      this._inFlight += 1;
      return;
    }
    await new Promise((resolve) => {
      this._waitQueue.push(resolve);
    });
    this._inFlight += 1;
  }

  _releaseSlot() {
    this._inFlight -= 1;
    const next = this._waitQueue.shift();
    if (next) next();
  }

  close() {
    // HTTP MCP doesn't need explicit close — session expires server-side
    this.sessionId = null;
    this.initialized = false;
  }
}
