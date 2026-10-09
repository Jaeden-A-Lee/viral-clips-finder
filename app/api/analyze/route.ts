import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { classifyGeminiError, formatSupplementalTranscript, normalizeYouTubeUrl, parseGeminiCandidates } from "@/app/lib/clip-analysis";

const GEMINI_MODEL = "gemini-3.8-flash";
const scoreKeys = [
  "hookStrength",
  "emotionalImpact",
  "storyCompleteness",
  "entertainmentOrInformation",
  "shareability",
  "audioVisualEngagement",
  "topicRelevance",
] as const;

const geminiOutputSchema = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          start: { type: "number", description: "Start time in seconds from the start of the source video." },
          end: { type: "number", description: "End time in seconds from the start of the source video." },
          hook: { type: "string", description: "A concise proposed hook or title." },
          explanation: { type: "string", description: "Why this moment may work as a short-form clip." },
          scores: {
            type: "object",
            properties: Object.fromEntries(scoreKeys.map((key) => [key, {
              type: "integer",
              minimum: 1,
              maximum: 5,
              description: "Integer rating from 1 (low) to 5 (high).",
            }])),
            required: [...scoreKeys],
            additionalProperties: false,
          },
        },
        required: ["start", "end", "hook", "explanation", "scores"],
        additionalProperties: false,
      },
    },
  },
  required: ["candidates"],
  additionalProperties: false,
};

function analyzeWithOpenAI(url: unknown, segments: unknown) {
  if (typeof url !== "string" || !Array.isArray(segments) || segments.length === 0) {
    throw new Error("OpenAI analysis requires a URL and transcript segments.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const transcriptText = segments
    .map((segment) => {
      if (!segment || typeof segment !== "object" ||
          typeof segment.start !== "number" || typeof segment.text !== "string") {
        throw new Error("Transcript segment is invalid.");
      }
      return `[${segment.start.toFixed(2)}s] ${segment.text}`;
    })
    .join("\n");

  return openai.responses.create({
    model: "gpt-5.2",
    instructions:
      "You identify the 3 most viral short-form clips from a podcast transcript. Return strictly valid JSON only. Use ONLY timestamps explicitly present in the provided transcript segments. Each clip must correspond to the exact segment where the quoted hook appears. Never estimate, interpolate, or shift timestamps earlier or later. If uncertain, choose the closest exact transcript segment timestamp. Prioritize timestamp precision over clip quality.",
    input: `\nVideo URL: ${url}\n\nTimestamped Transcript:\n${transcriptText}\n`,
    text: {
      format: {
        type: "json_schema",
        name: "clip_analysis",
        strict: true,
        schema: {
          type: "object",
          required: ["url", "clips"],
          additionalProperties: false,
          properties: {
            url: { type: "string" },
            clips: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: {
                type: "object",
                required: ["start", "end", "hook", "reason"],
                additionalProperties: false,
                properties: {
                  start: { type: "string" },
                  end: { type: "string" },
                  hook: { type: "string" },
                  reason: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  });
}

function clientError(error: unknown): { message: string; status: number } {
  const status = error && typeof error === "object" && "status" in error &&
    typeof error.status === "number" ? error.status : 0;

  if (status === 400 || status === 404) {
    return { message: "Gemini could not access that public YouTube video. Check the URL and video availability.", status: 422 };
  }
  if (status === 401 || status === 403) {
    return { message: "Gemini could not authorize this request. Check the server API key and project access.", status: 503 };
  }
  if (status === 429) {
    return { message: "Gemini is temporarily rate limited or out of quota. Please try again later.", status: 429 };
  }
  if (status >= 500) {
    return { message: "Gemini is temporarily unavailable. Please try again later.", status: 502 };
  }
  return { message: "Video analysis failed. Please check the URL and try again.", status: 502 };
}

export async function POST(req: Request) {
  let requestedProvider: unknown = "gemini";
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { url, provider = "gemini", segments, captionContext } = body as Record<string, unknown>;
    requestedProvider = provider;
    if (provider === "openai") {
      const response = await analyzeWithOpenAI(url, segments);
      return NextResponse.json(JSON.parse(response.output_text));
    }
    if (provider !== "gemini") {
      return NextResponse.json({ error: "Unsupported analysis provider." }, { status: 400 });
    }

    const videoUrl = normalizeYouTubeUrl(url);
    if (!videoUrl) {
      return NextResponse.json({ error: "Enter a valid public YouTube video URL." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini is not configured. Add GEMINI_API_KEY to the server environment." }, { status: 503 });
    }

    const transcriptText = formatSupplementalTranscript(captionContext);
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({
      model: GEMINI_MODEL,
      input: [
        { type: "video", uri: videoUrl },
        {
          type: "text",
          text: `Find the five strongest distinct short-form clip moments in this public YouTube video. Score each dimension from 1 (weak) to 5 (exceptional), using 2 and 4 for intermediate quality: hook strength (20%, opening attention); emotional impact (20%, intensity or resonance); story completeness (15%, understandable setup and payoff); entertainment or informational value (15%, amusing or useful); shareability (15%, likely to prompt sharing or discussion); audio/visual engagement (10%, compelling delivery, reactions, or visuals); topic relevance (5%, fit for an audience interested in this video's subject). Return timestamps as numeric seconds from the beginning of the complete source video, using the video timeline as evidence; do not invent or shift timestamps. Each moment should stand alone, have a concise hook, and explain why it could work as a short clip. Avoid substantially overlapping moments. The scores are editorial judgments, not probabilities.${transcriptText ? `\n\nOptional YouTube caption transcript for speech context (caption timestamps are supplemental only; use the video timeline as the authority):\n${transcriptText}` : ""}`,
        },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: geminiOutputSchema,
      },
    });

    if (!interaction.output_text) {
      throw new Error("Gemini returned no text output.");
    }

    const candidates = parseGeminiCandidates(interaction.output_text);

    return NextResponse.json({ provider: "gemini", clips: candidates });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Gemini returned")) {
      return NextResponse.json({ error: "Gemini returned an unreadable response. Please try again." }, { status: 502 });
    }
    if (error instanceof Error && error.message.startsWith("Candidate ")) {
      return NextResponse.json({ error: "Gemini returned clip details that failed validation. Please try again." }, { status: 502 });
    }
    const result = requestedProvider === "openai" ? clientError(error) : classifyGeminiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
