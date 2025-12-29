// netlify/functions/for-more-travel-assistant.js

const BUSINESS_FORM_URL = "https://raythetravelpreneur.netlify.app/";
const TRAVEL_QUOTE_FORM_URL = "https://formoretravelstationquoteform.netlify.app/";

const SYSTEM_PROMPT = `
You are the For More Travel Assistant for For More Travel Station (Ray Johnson).

Your role is to identify visitor intent and respond accordingly, then guide the visitor toward a clear next step.

Intent types:
1) Traveler intent: planning trips, browsing destinations, requesting quotes.
2) Business-curious intent: how it works, flexibility, commissions, getting started.
3) Partner intent: partnership interest, building a business, joining a team.
4) Skeptic intent: doubt, concerns, MLM questions.

Core rules:
- Stay calm, grounded, factual.
- Never hype or argue.
- No income guarantees.
- Match the visitor's intent level.
- Ask one clear next-step question when appropriate.
- Keep responses concise and friendly.
- No long dashes.

Conversion rules:
- Travel intent routes to the travel quote form.
- Business or partnership curiosity routes to the business page.
- Present links as the easiest next step, never as a commitment.

Tone:
- Human, confident, respectful, not salesy.
`;

function buildCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function looksLikeBusinessInterest(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes("get started") ||
    t.includes("how do i start") ||
    t.includes("join") ||
    t.includes("partner") ||
    t.includes("business") ||
    t.includes("opportunity") ||
    t.includes("commission") ||
    t.includes("residual") ||
    t.includes("tell me more")
  );
}

function looksLikeTravelQuoteIntent(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes("quote") ||
    t.includes("price") ||
    t.includes("cost") ||
    t.includes("book") ||
    t.includes("booking") ||
    t.includes("cruise") ||
    t.includes("resort") ||
    t.includes("vacation") ||
    t.includes("trip") ||
    t.includes("travel")
  );
}

function alreadySharedLink(messages, url) {
  const joined = messages
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join(" ")
    .toLowerCase();
  return joined.includes(url.toLowerCase());
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || "*";
  const corsHeaders = buildCorsHeaders(origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

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
        body: JSON.stringify({ error: "OpenAI API key missing" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userMessage = typeof body.message === "string" ? body.message : "";

    const normalizedMessages =
      messages.length > 0
        ? messages
        : userMessage
        ? [{ role: "user", content: userMessage }]
        : [];

    if (normalizedMessages.length === 0) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No message provided" }),
      };
    }

    const messagesForAI = [
      { role: "system", content: SYSTEM_PROMPT },
      ...normalizedMessages,
    ];

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      return {
        statusCode: aiResponse.status || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "OpenAI error", details: data }),
      };
    }

    let reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "Thanks for your message. How can I help you today?";

    const lastUserText =
      normalizedMessages
        .slice()
        .reverse()
        .find((m) => m.role === "user")?.content || "";

    const shouldOfferQuoteForm =
      looksLikeTravelQuoteIntent(lastUserText) &&
      !alreadySharedLink(normalizedMessages, TRAVEL_QUOTE_FORM_URL);

    const shouldOfferBusinessForm =
      looksLikeBusinessInterest(lastUserText) &&
      !alreadySharedLink(normalizedMessages, BUSINESS_FORM_URL);

    if (shouldOfferQuoteForm) {
      reply += `
<br><br>
If you would like a personalized quote, the easiest next step is a quick request form.
<br><br>
<a href="${TRAVEL_QUOTE_FORM_URL}" target="_blank" rel="noopener noreferrer">
Request a travel quote
</a>
`;
    } else if (shouldOfferBusinessForm) {
      reply += `
<br><br>
The easiest next step is a quick form so Ray can follow up personally and walk you through how it works.
<br><br>
<a href="${BUSINESS_FORM_URL}" target="_blank" rel="noopener noreferrer">
Continue the conversation here
</a>
`;
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (error) {
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
