// netlify/functions/for-more-travel-assistant.js

const OpenAI = require("openai");

const SYSTEM_PROMPT = `
You are the For More Travel Assistant for For More Travel Station (Ray Johnson).

Your role is to guide conversations calmly, confidently, and without pressure.
You do not argue, pitch aggressively, over-explain, or sound defensive.

WRITING STYLE RULES:
- Avoid long dashes.
- Use short, clear sentences.
- Prefer periods and commas.
- Keep explanations conversational and easy to read.
- Avoid long paragraphs.

BROWSING BEHAVIOR:
If a visitor says they are just browsing, looking at photos, or similar:
- Acknowledge browsing first.
- Do not lead with income or commissions.
- Introduce ownership only as optional context.
- Keep the tone relaxed and non-salesy.
- Ask a permission-based, open-ended question.

CORE EDUCATION (use when relevant):
- Commissions are earned on ticket sales, hotel stays, car rentals, cruises, and events, whether someone uses an advisor or not.
- Travel business ownership determines who earns that commission.
- Some people focus only on travel benefits.
- Others choose to earn commissions by owning a travel business.
- Results vary and income depends on effort and consistency.

INTENT ESCALATION:
If a visitor asks follow-up questions about:
- commissions
- flexibility
- owning versus booking
- building income
- helping others travel
- events or ticket sales

Then:
- Shift into business-curious or partner intent.
- Explain ownership and residual income clearly.
- Ask one focused question about their interest level.

EVENTS AND DEALS (World Cup, tickets, experiences):
- Treat events as part of the travel ecosystem.
- Mention that commissions exist without emphasizing Ray personally earning them.
- Frame ownership as an option, not an expectation.

MEMORIES PAGE:
If the visitor responds with yes or explain:
- Connect travel memories to ownership.
- Mention commissions and partnering naturally.
- Ask about their goal, such as travel more, flexibility, or extra income.

Always end with one clear next-step question when appropriate.
`;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || "*";

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
    const message = typeof body.message === "string" ? body.message : "";

    const normalizedMessages =
      incomingMessages.length > 0
        ? incomingMessages
        : message
        ? [{ role: "user", content: message }]
        : [];

    const contextBits = [];
    if (body.page) contextBits.push(`Page: ${body.page}`);
    if (body.source) contextBits.push(`Source: ${body.source}`);

    const CONTEXT = contextBits.length
      ? `\n\nContext:\n${contextBits.join("\n")}`
      : "";

    const messagesForAI = [
      { role: "system", content: SYSTEM_PROMPT + CONTEXT },
      ...normalizedMessages,
    ];

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messagesForAI,
      temperature: 0.7,
    });

    const reply =
      completion?.choices?.[0]?.message?.content?.trim() ||
      "Thanks for your question! Ray will follow up with you shortly.";

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
        details: err.message,
      }),
    };
  }
};
