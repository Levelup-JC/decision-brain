const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.deepseek.com/v1";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "deepseek-chat";
const RULE_ONLY = process.env.CHAT_RULE_ONLY === "1";

export function isRuleOnly() {
  return RULE_ONLY || !LLM_API_KEY;
}

export async function chatCompletion(systemPrompt, userMessage, { temperature = 0.3, maxTokens = 800, timeoutMs = 8000 } = {}) {
  if (isRuleOnly()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      throw new Error(`LLM request failed (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}
