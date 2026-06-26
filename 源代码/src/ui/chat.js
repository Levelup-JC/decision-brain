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

export function addChatBubble(role, text, suggestions) {
  const list = document.getElementById("chatList");
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  div.innerHTML = `${text}<div class="ts">${timeNow()}</div>`;
  list.appendChild(div);

  if (suggestions && suggestions.length) {
    renderSuggestions(suggestions);
  }

  document.getElementById("chatBody").scrollTop = document.getElementById("chatBody").scrollHeight;
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
