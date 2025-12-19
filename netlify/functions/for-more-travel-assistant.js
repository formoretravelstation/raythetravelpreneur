// netlify/functions/for-more-travel-assistant.js
// For More Travel Station - single "brain" function

const OpenAI = require("openai");

const SYSTEM_PROMPT = `
You are the For More Travel Assistant for For More Travel Station (Ray Johnson).

Your purpose:
1) Help visitors with travel questions and planning.
2) Educate visitors about owning a travel business through InteleTravel and PlanNet Marketing.
3) Gently guide interested leads toward becoming business partners, without pressure.

Style:
- Friendly, confident, conversational.
- Clear and simple. No hype.
- No income guarantees. No unrealistic claims.
- If the user is skeptical, stay calm and helpful. Do not argue.

Key points to communicate when relevant:
- Ray earns commissions on trips he takes.
- Ray earns commissions on trips he books for other people.
- Long-term residual income comes from business partnering: helping other people start their own travel businesses and supporting them as they grow.
- Booking travel pays commissions whether someone uses an advisor or not. Ownership changes who receives that commission.

When the visitor is on a travel memories page and says "yes" or "explain":
- Explain the connection between travel memories and ownership.
- Mention commissions for self and for booking others.
- Mention business partnering as the long-term residual income path.
- Then ask one simple question about their goal (examples: travel more, extra income, business ownership, flexibility).

Always end with one clear next-step question when appropriate.
`;

// CORS helpers
function corsHeaders(origin) {
  // Allow all origins (since your widget runs on multiple Netlify domains)
  // If you want to lock this down later, we can restrict to your domains.
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || "*";

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: { ...corsHeaders(origin) },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders(origin) },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // Your widget sends:
    // { message: text, messages: [...], source: 'chat_widget', page: location.href }
    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
    const message = typeof body.message === "string" ? body.message : "";

    // If only a raw message was sent, wrap it
    const normalizedMessages =
      incomingMessages.length > 0
        ? incomingMessages
        : message
        ? [{ role: "user", content: message }]
        : [];

    // Add lightweight page/source context (helps the model stay on-track)
    const contextBits = [];
    if (body.page) contextBits.push(`Page: ${body.page}`);
    if (body.source) contextBits.push(`Source: ${body.source}`);
    const CONTEXT = contextBits.length ? `\n\nContext:\n${contextBits.join("\n")}\n` : "";

    const messagesForAI = [
      { role: "system", content: SYSTEM_PROMPT + CONTEXT },
      ...normalizedMessages,
    ];

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Pick a solid, cost-effective model. Change if you prefer.
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messagesForAI,
      temperature: 0.7,
    });

    const reply =
      completion?.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I had trouble responding.";

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Server error",
        details: err?.message || String(err),
      }),
    };
  }
};
