// OpenAI-compatible chat-completions client. Works with OpenAI (default) or any
// compatible gateway such as OpenCode Zen (MODEL_BASE_URL=https://opencode.ai/zen/v1).
// Credentials come only from the server environment and never enter model context.
export const modelKey = () =>
  process.env.MODEL_API_KEY || process.env.OPENAI_API_KEY || "";
export const modelBaseUrl = () =>
  (process.env.MODEL_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
export async function chatCompletion(body: unknown, timeoutMs = 45_000) {
  return fetch(`${modelBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${modelKey()}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(body),
  });
}
/** Some compatible models wrap JSON in a Markdown fence; strip it before parsing. */
export function parseJsonContent(content: string) {
  const t = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return JSON.parse(fenced ? fenced[1] : t);
}
