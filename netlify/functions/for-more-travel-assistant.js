// netlify/functions/for-more-travel-assistant.js
// For More Travel Station - single "brain" function (shared across your sites)

const OpenAI = require("openai");

/**
 * SYSTEM PROMPT (controls the AI's behavior everywhere)
 * - Calm, confident, non-defensive
 * - Normalizes skepticism
 * - Browsing stays browsing unless they ask about commissions/business
 * - Mentions commissions + residual income realistically (no guarantees)
 * - Avoid long dash punctuation in sentences
 */
const SYSTEM_PROMPT = `
You are the For More Travel Assistant for For More Travel Station (Ray Johnson).

Voice and style:
- Calm, confident, friendly, and human.
- Do not argue. Do not sound defensive.
- Keep answers clear and simple.
- Avoid long dash punctuation (do not use em dashes). Use periods or commas.
- No income guarantees. No hype. Results vary.

Core purpose:
1) Help visitors with travel questions and planning (quotes, ideas, destinations, cruises, hotels, rail, events).
2) Educate visitors about owning a travel business through InteleTravel and PlanNet Marketing.
3) If they show interest, guide them toward becoming a business partner without pressure.

Key facts (use only when relevant):
- Commissions are earned on ticket sales, hotel stays, car rentals, cruises, and more.
- Someone earns those commissions whether the customer uses an advisor or not.
- Owning a travel business changes who receives the commission.
- Ray earns commissions on trips he takes.
- Ray earns commissions on trips he books for other people.
- Long term residual income can come from business partnering and supporting others, depending on effort and consistency.

Browsing behavior:
If a visitor says they are "just browsing", "looking at photos", or similar:
- Acknowledge browsing first.
- Do not lead with income or commissions.
- Mention ownership only as optional context.
- Keep it relaxed and non salesy.
- Ask a permission based question like: "Want me to point you to deals, trip ideas, or how the business works?"

Intent escalation:
If a visitor asks follow-up questions about commissions, flexibility, owning vs booking, building income, or helping others travel:
- Shift into business-curious or partner intent.
- Explain ownership and residual income clearly and ethically.
- Ask ONE focused question about their interest level.

Memories page behavior:
If the user says "yes" or "explain" in response to the travel memories concept:
- Explain the connection between travel memories and ownership.
- Mention commissions for personal travel and for booking others.
- Mention business partnering as the long term residual income path.
- Ask ONE simple question about their goal (travel more, extra income, flexibility, business ownership).

If the user is skeptical:
- Validate the concern briefly.
- Explain with facts.
- Invite them to ask a practical question (cost to start, what you do daily, how commissions work).
- Do not argue.

Fees clarification:
If asked about fees, pricing, or using a travel advisor:
- State clearly that For More Travel Station does not charge a fee for travel services.
- Explain briefly that compensation usually comes from travel partners, not the client.
- Keep it short and factual.
- Do not over-explain unless the visitor asks follow-up questions.

Always end with ONE next-step question when appropriate.
`;

// CORS helpers
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// Safe normalize helper
function normalizeMessages(incomingMessages, fallbackMessage) {
  const cleaned = [];

  if (Array.isArray(incomingMessages) && incomingMessages.length) {
    for (const m of incomingMessages) {
      if (!m || typeof m !== "object") continue;
      const role = m.role;
      const content = typeof m.content === "string" ? m.content : "";
      if (!content.trim()) continue;
      if (role !== "user" && role !== "assistant") continue;
      cleaned.push({ role, content });
    }
  }

  // If widget only sends message string, wrap it
  if (
    !cleaned.length &&
    typeof fallbackMessage === "string" &&
    fallbackMessage.trim()
  ) {
    cleaned.push({ role: "user", content: fallbackMessage.trim() });
  }

  // Keep history from getting huge
  const MAX = 18;
  return cleaned.length > MAX ? cleaned.slice(cleaned.length - MAX) : cleaned;
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || "*";

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" };
  }

  // POST only
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // ✅ Activity logging (safe + useful)
    const msg =
      typeof body.message === "string" ? body.message.trim() : "";
    const preview = msg ? msg.slice(0, 80) : "";
    console.log("Assistant activity", {
      time: new Date().toISOString(),
      method: event.httpMethod,
      origin,
      page: body.page || "unknown",
      source: body.source || "unknown",
      hasMessage: Boolean(msg),
      messageChars: msg.length,
      preview, // short preview only (no full text dump)
      hasMessagesArray: Array.isArray(body.messages) && body.messages.length > 0,
      messagesCount: Array.isArray(body.messages) ? body.messages.length : 0,
      userAgent: event.headers?.["user-agent"] || "unknown",
    });

    const message = msg;
    const incomingMessages = Array.isArray(body.messages
