import { timeNow } from "./utils.js";

let chatCallback = null;

export function onChatSend(fn) {
  chatCallback = fn;
}

export function initChat() {
  const input = document.getElementById("chatInput");
  const btn = document.getElementById("chatSendBtn");

  async function send() {
    const text = input.value.trim();
    if (!text) return;

    // Remove onboarding hint on first interaction
    const hint = document.getElementById("onboardingHint");
    if (hint) hint.remove();

    addChatBubble("user", text);
    input.value = "";
    input.disabled = true;
    btn.disabled = true;
    btn.textContent = "思考中...";

    try {
      if (chatCallback) await chatCallback(text);
    } catch (err) {
      console.error("sendChat failed:", err);
      addErrorBubble(err.message || "请求失败，请重试");
    } finally {
      input.disabled = false;
      btn.disabled = false;
      btn.textContent = "发送";
      input.focus();
    }
  }

  btn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
}

export function addChatBubble(role, text, suggestions, latencyMs) {
  const list = document.getElementById("chatList");
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;

  let latencyHtml = "";
  if (role === "chief" && latencyMs != null) {
    const cls = latencyMs < 2000 ? "fast" : latencyMs < 6000 ? "ok" : "slow";
    const label = latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`;
    latencyHtml = `<span class="chat-latency ${cls}">${label}</span>`;
  }

  // Make trace references and MCP source links clickable
  const linkedText = makeLinksClickable(text);

  if (role === "chief") {
    div.innerHTML = `<span class="typewriter-text"></span>${latencyHtml}<div class="ts">${timeNow()}</div>`;
    list.appendChild(div);
    typewriteText(div.querySelector(".typewriter-text"), linkedText, () => {
      if (suggestions && suggestions.length) renderSuggestions(suggestions);
    });
  } else {
    div.innerHTML = `${linkedText}${latencyHtml}<div class="ts">${timeNow()}</div>`;
    list.appendChild(div);
    if (suggestions && suggestions.length) renderSuggestions(suggestions);
  }

  document.getElementById("chatBody").scrollTop = document.getElementById("chatBody").scrollHeight;
}

function makeLinksClickable(text) {
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Convert markdown-style bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Convert double newlines to paragraph breaks, single newlines to <br>
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>")
    .replace(/(https?:\/\/[^\s<>"]+)/g,
      '<a href="$1" target="_blank" rel="noopener" style="color:var(--accent-2);text-decoration:underline;">$1</a>')
    .replace(/\[trace:(\d+)\]/gi, '<span class="trace-ref" data-trace-id="$1" title="查看数据来源">&#128279; trace#$1</span>')
    .replace(/\[source:([^\]]+)\]/gi, '<span class="source-ref" data-source="$1" title="数据来源">&#128211; $1</span>');
}

function typewriteText(el, html, onDone) {
  const SPEED = 18;
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const nodes = Array.from(temp.childNodes);
  let nodeIdx = 0;
  let charIdx = 0;
  let currentTextNode = null;
  let currentText = "";

  function step() {
    if (nodeIdx >= nodes.length) {
      if (onDone) onDone();
      return;
    }

    const node = nodes[nodeIdx];
    if (node.nodeType === Node.TEXT_NODE) {
      if (currentTextNode === null) {
        currentTextNode = document.createTextNode("");
        el.appendChild(currentTextNode);
        currentText = node.textContent || "";
        charIdx = 0;
      }
      if (charIdx < currentText.length) {
        currentTextNode.textContent += currentText[charIdx];
        charIdx++;
        document.getElementById("chatBody").scrollTop = document.getElementById("chatBody").scrollHeight;
        setTimeout(step, SPEED);
        return;
      }
      currentTextNode = null;
      nodeIdx++;
      setTimeout(step, SPEED * 2);
      return;
    }
    el.appendChild(node.cloneNode(true));
    nodeIdx++;
    setTimeout(step, SPEED * 3);
  }

  step();
}

export function addErrorBubble(message) {
  const list = document.getElementById("chatList");
  const div = document.createElement("div");
  div.className = "chat-msg error";
  div.innerHTML = `${message}<div class="ts">${timeNow()}</div>`;
  list.appendChild(div);
  document.getElementById("chatBody").scrollTop = document.getElementById("chatBody").scrollHeight;
}

export function renderSuggestions(suggestions) {
  const row = document.getElementById("suggestionsRow");
  row.innerHTML = suggestions
    .map(s => `<button class="sug-btn">${s}</button>`)
    .join("");

  row.querySelectorAll(".sug-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("chatInput").value = btn.textContent;
      document.getElementById("chatSendBtn").click();
    });
  });
}
