// netlify/functions/for-more-travel-assistant.js

const FORM_URL = "https://formoretravelstationquoteform.netlify.app/"; 
// If you want a different capture form for partnerships, put it here.

const SYSTEM_PROMPT = `
You are the For More Travel Assistant for For More Travel Station (Ray Johnson).

Your role is to identify visitor intent and respond accordingly, then guide the visitor toward a clear next step.

Intent types:
1) Traveler intent: planning trips, browsing destinations, travel questions.
2) Business-curious intent: how it works, flexibility, commissions, getting started.
3) Partner intent: partnership interest, building a business, joining a team, ownership.
4) Skeptic intent: doubt, sarcasm, MLM concerns.

Core rules:
- Stay calm, grounded, factual.
- Never hype, never argue.
- No income guarantees or "make money fast" claims.
- Match the visitor's intent level.
- Ask one clear next-step question when appropriate.
- Keep responses concise and friendly.
- No long dashes.

Key facts you can use when relevant:
- Someone always earns the commission on travel.
- Ray can earn commissions on trips he books for others.
- Ray can earn commissions on trips he takes.
- Ownership determines who gets paid.
- Long-term residual income comes from business partnering, but never promise results.

Conversion rule for business and partnership curiosity:
- Do not push.
- If the visitor shows interest in learning more, guide them to a short form to capture name and email so Ray can follow up personally.
- Present the form as the easiest next step to continue the conversation, not a commitment.

If the visitor wants travel planning:
- Ask for trip basics (where, dates, number of travelers, budget range, departure city).
- Provide guidance and options, then invite them to the form to request a quote when appropriate.

Tone:
- Human, confident, respectful, not salesy.
`;

// Build CORS headers based on origin
function buildCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// Lightweight heuristic to encourage form capture when interest is present
function looksLikeBusinessInterest(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes("join") ||
    t.includes("sign up") ||
    t.includes("partner") ||
    t.includes("partnership") ||
    t.includes("how do i start") ||
    t.includes("how do i get started") ||
    t.includes("business") ||
    t.includes("opportunity") ||
    t.includes("incom") ||
    t.includes("commission") ||
    t.includes("work from") ||
    t.includes("residual") ||
    t.includes("tell me more")
  );
}

function hasAlreadySharedForm(messages, formUrl) {
  const joined = (messages || [])
    .map((m) => (typeof m?.content === "string" ? m.content : ""))
    .join("\n")
    .toLowerCase();
  return joined.includes((formUrl || "").toLowerCase());
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || "*";
  const corsHeaders = buildCorsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Server not configured with OpenAI key" }),
      };
    }

    const body = JSON.parse(event.body || "{}");

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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing message in request body" }),
      };
    }

    // Optional context (helps page-specific behavior)
    const contextBits = [];
    if (body.page) contextBits.push(`Page: ${body.page}`);
    if (body.source) contextBits.push(`Source: ${body.source}`);

    const contextText =
      contextBits.length > 0 ? `\nContext:\n${contextBits.join("\n")}\n` : "";

    const messagesForAI = [
      { role: "system", content: SYSTEM_PROMPT + contextText },
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
        temperature: 0.6,
        max_tokens: 450,
        messages: messagesForAI,
      }),
    });

    const data = await openAIResponse.json();

    if (!openAIResponse.ok) {
      console.error("OpenAI API error:", data);
      return {
        statusCode: openAIResponse.status || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "OpenAI API error", details: data }),
      };
    }

    let reply =
      (data?.choices?.[0]?.message?.content || "").trim() ||
      "Thanks for your message. How can I help you today?";

    // Add a gentle form invite when business interest is detected and form not already shared
    const lastUserText =
      [...normalizedMessages].reverse().find((m) => m?.role === "user")?.content || "";

    const shouldOfferForm =
      looksLikeBusinessInterest(lastUserText) && !hasAlreadySharedForm(normalizedMessages, FORM_URL);

    if (shouldOfferForm) {
      reply +=
        "\n\nIf you would like, the easiest next step is a quick form so Ray can follow up personally.\n" +
        `Continue here: ${FORM_URL}`;
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        details: error?.message || String(error),
      }),
    };
  }
};
