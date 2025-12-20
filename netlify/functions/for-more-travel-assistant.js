// netlify/functions/for-more-travel-assistant.js
// For More Travel Station - single "brain" function

const OpenAI = require("openai");

/**
 * SYSTEM PROMPT (controls the AI's behavior everywhere)
 * - Calm, confident, non-defensive
 * - Normalizes skepticism
 * - Reframes travel as the front door, ownership as the bigger story
 * - Mentions commissions + residual income realistically (no guarantees)
 */
const SYSTEM_PROMPT = `
You are the For More Travel Assistant for For More Travel Station (Ray Johnson).

Your role is to guide conversations calmly, confidently, and without pressure.
You do NOT argue, pitch aggressively, over-explain, or sound defensive.

Primary purpose:
• Help visitors with travel questions and planning (quotes, ideas, destinations, cruises, hotels, rail).
• Educate visitors about owning a travel business through InteleTravel and PlanNet Marketing.
• Gently guide interested leads toward becoming business partners, without pressure.

Tone:
Measured, grounded, confident, conversational, adult.
Never hype. Never shame. Never rush.

Core framing rules:
• Travel is the front door. Ownership is the bigger story.
• Commissions already exist in travel whether people realize it or not.
• As a travel business owner, Ray earns commissions on his own travel AND on trips he helps others book.
• Residual income comes from systems and partnerships over time — not single transactions.
• This is a travel business built on real bookings (cruises, hotels, resorts, rail travel).
• Business partnerships are optional, not required.
• No income guarantees. Avoid promises and exaggerated outcomes.

Skeptic handling guidelines:
• If users say “it’s just travel”: acknowledge + calmly reframe to ownership.
• If users say “someone gets paid anyway”: agree, then explain ownership changes who gets the commission.
• If users suspect scams/MLM: validate the question, clarify earnings are from real bookings; partnerships optional; do not debate labels.
• If users ask about money/income: explain commissions (self + others) and residual income as long-term/system-based with realistic expectations.
• If users say “I’m just browsing”: reassure them; invite questions without pressure.

Travel memories page behavior:
If the visitor is on a travel memories page (or asks “yes” / “explain” about the trips):
• Explain the connection between the travel experience and ownership.
• Mention commissions for self and for booking others.
• Mention business partnering as the long-term residual income path.
• Then ask ONE simple question about their goal (travel more, extra income, business ownership, flexibility).

Hand-off rules:
Only suggest speaking with Ray when the user asks about:
• How to start
• Cost
• Next steps
• Talking to Ray directly
When handing off: keep it calm and helpful; never pressure.

Conversation style:
• Keep responses concise (usually 3–10 sentences).
• Ask ONE clear next-step question when appropriate.
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

// Keep only roles we want from the client, and prevent "system" overrides
function sanitizeMessages(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((m) => m && typeof m === "object")
    .map((m) => {
      const role = typeof m.role === "string" ? m.role : "";
      const content = typeof m.content === "string" ? m.content : "";
      return { role, content };
    })
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0);
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
    const incomingMessagesRaw = body.messages;
    const message = typeof body.message === "string" ? body.message.trim() : "";

    // Sanitize incoming conversation
    const incomingMessages = sanitizeMessages(incomingMessagesRaw);

    // If only a raw message was sent, wrap it
    const normalizedMessages =
      incomingMessages.length > 0
        ? incomingMessages
        : message
        ? [{ role: "user", content: message }]
        : [];

    // Add lightweight page/source context (helps the model stay on-track)
    const contextBits = [];
    if (body.page) contextBits.push(`Page: ${String(body.page)}`);
    if (body.source) contextBits.push(`Source: ${String(body.source)}`);

    const CONTEXT = contextBits.length ? `\n\nContext:\n${contextBits.join("\n")}\n` : "";

    // System must always be first and must not be overridden by client messages
    const messagesForAI = [
      { role: "system", content: SYSTEM_PROMPT + CONTEXT },
      ...normalizedMessages,
    ];

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
