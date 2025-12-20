// netlify/functions/for-more-travel-assistant.js

const SYSTEM_PROMPT = `
You are the For More Travel Assistant for For More Travel Station (Ray Johnson).

Your role is to identify visitor intent and respond accordingly.

INTENT TYPES:
1) Traveler intent – planning trips, browsing destinations, memories.
2) Business-curious intent – commissions, flexibility, how it works.
3) Partner intent – ownership, residual income, business building.
4) Skeptic intent – doubt, sarcasm, MLM concerns.

CORE RULES:
- Stay calm, grounded, factual.
- Never hype or argue.
- No income guarantees.
- Match the visitor’s intent level.
- Ask ONE clear next-step question when appropriate.

KEY FACTS (use when relevant):
- Ray earns commissions on trips he takes.
- Ray earns commissions booking trips for others.
- Someone always earns the commission on travel.
- Ownership determines who gets paid.
- Long-term residual income comes from business partnering.

MEMORIES PAGE:
If user says “yes” or “explain”:
- Connect travel memories to ownership.
- Mention commissions + partnering.
- Ask about their goal (travel, extra income, flexibility).

Tone: human, confident, respectful.
`;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || "*";
  const headers = corsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Server not configured with OpenAI key" }),
      };
    }

    // Accept either:
    // 1) { message: "hi" }
    // 2) { messages: [{role,content}, ...], message?: "hi" }
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const rawMessage = typeof body.message === "string" ? body.message : "";

    const normalizedMessages =
      rawMessages.length > 0
        ? rawMessages
        : rawMessage
        ? [{ role: "user", content: rawMessage }]
        : [];

    if (normalizedMessages.length === 0) {
      return {
        statusCode: 400,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing message in request body" }),
      };
    }

    // Optional context (helps intent + page-specific behavior)
    const contextBits = [];
    if (body.page) contextBits.push(`Page: ${body.page}`);
    if (body.source) contextBits.push(`Source: ${body.source}`);
    const CONTEXT =
      contextBits.length > 0 ? `\n\nContext:\n${contextBits.join("\n")}\n` : "";

    const messagesForAI = [
      { role: "system", content: SYSTEM_PROMPT + CONTEXT },
      ...normalizedMessages,
    ];

    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 500,
        messages: messagesForAI,
      }),
    });

    const data = await openAIResponse.json();

    if (!openAIResponse.ok) {
      console.error("OpenAI API error:", data);
      return {
        statusCode: openAIResponse.status || 500,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "OpenAI API error",
          details: data,
        }),
      };
    }

    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "Thanks for your question! Ray will follow up with you shortly.";

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        details: error?.message || String(error),
      }),
    };
  }
};
