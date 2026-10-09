export const SCORE_WEIGHTS = {
  hookStrength: 0.2,
  emotionalImpact: 0.2,
  storyCompleteness: 0.15,
  entertainmentOrInformation: 0.15,
  shareability: 0.15,
  audioVisualEngagement: 0.1,
  topicRelevance: 0.05,
} as const;

export type CandidateScores = Record<keyof typeof SCORE_WEIGHTS, number>;

export type ClipCandidate = {
  start: number;
  end: number;
  hook: string;
  explanation: string;
  scores: CandidateScores;
  totalScore: number;
};

export type ClientSafeError = { message: string; status: number };

export function classifyGeminiError(error: unknown): ClientSafeError {
  const status = error && typeof error === "object" && "status" in error &&
    typeof error.status === "number" ? error.status : 0;

  if (status === 401 || status === 403) {
    return { message: "Gemini could not authorize this request. Check the server API key and project access.", status: 503 };
  }
  if (status === 429) {
    return { message: "Gemini is temporarily rate limited or out of quota. Please try again later.", status: 429 };
  }
  if (status >= 500 && status < 600) {
    return { message: "Gemini is temporarily unavailable. Please try again later.", status: 502 };
  }
  return {
    message: "Video analysis failed. Check Gemini API credentials, model access, and request configuration, then try again.",
    status: 502,
  };
}

const SCORE_KEYS = Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[];

export function calculateTotalScore(scores: CandidateScores): number {
  const weightedScore = SCORE_KEYS.reduce(
    (total, key) => total + ((scores[key] - 1) / 4) * SCORE_WEIGHTS[key],
    0,
  );

  return Math.round(weightedScore * 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCandidates(value: unknown): ClipCandidate[] {
  if (!Array.isArray(value) || value.length !== 5) {
    throw new Error("Gemini must return exactly five candidates.");
  }

  const candidates = value.map((candidate): ClipCandidate => {
    if (!isRecord(candidate) || !isRecord(candidate.scores)) {
      throw new Error("Candidate structure is invalid.");
    }

    const { start, end, hook, explanation } = candidate;
    if (
      typeof start !== "number" || !Number.isFinite(start) || start < 0 ||
      typeof end !== "number" || !Number.isFinite(end) || end <= start ||
      typeof hook !== "string" || !hook.trim() || hook.length > 200 ||
      typeof explanation !== "string" || !explanation.trim() || explanation.length > 1200
    ) {
      throw new Error("Candidate fields or timestamps are invalid.");
    }

    const scores = {} as CandidateScores;
    for (const key of SCORE_KEYS) {
      const score = candidate.scores[key];
      if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
        throw new Error("Candidate scores must be integers from 1 through 5.");
      }
      scores[key] = score;
    }

    return {
      start,
      end,
      hook: hook.trim(),
      explanation: explanation.trim(),
      scores,
      totalScore: calculateTotalScore(scores),
    };
  });

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const overlap = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
      const shorterDuration = Math.min(a.end - a.start, b.end - b.start);
      if (overlap / shorterDuration > 0.5) {
        throw new Error("Candidate moments overlap substantially.");
      }
    }
  }

  return candidates.sort((a, b) => b.totalScore - a.totalScore || a.start - b.start);
}

export function parseGeminiCandidates(outputText: string): ClipCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("Gemini returned malformed JSON.");
  }

  if (!isRecord(parsed)) throw new Error("Gemini returned an invalid response.");
  return validateCandidates(parsed.candidates);
}

export function normalizeYouTubeUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId: string | null = null;
  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v");
    else videoId = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})(?:\/|$)/)?.[1] ?? null;
  }

  if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function formatSupplementalTranscript(value: unknown): string | undefined {
  if (typeof value === "string") {
    const boundedText = value.trim().slice(0, 20_000);
    return boundedText || undefined;
  }
  if (!Array.isArray(value)) return undefined;

  const lines: string[] = [];
  let remaining = 20_000;
  for (const segment of value) {
    if (
      !isRecord(segment) || typeof segment.start !== "number" ||
      !Number.isFinite(segment.start) || segment.start < 0 ||
      typeof segment.text !== "string" || !segment.text.trim()
    ) continue;

    const line = `[${segment.start.toFixed(2)}s] ${segment.text.trim()}`;
    if (remaining <= 0) break;
    const boundedLine = line.slice(0, remaining);
    lines.push(boundedLine);
    remaining -= boundedLine.length;
  }

  return lines.length ? lines.join("\n") : undefined;
}
