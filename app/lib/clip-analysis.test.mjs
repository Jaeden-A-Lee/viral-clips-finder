import assert from "node:assert/strict";
import test from "node:test";
import { calculateTotalScore, classifyGeminiError, formatSupplementalTranscript, normalizeYouTubeUrl, parseGeminiCandidates, validateCandidates } from "./clip-analysis.ts";

const scores = {
  hookStrength: 5,
  emotionalImpact: 4,
  storyCompleteness: 3,
  entertainmentOrInformation: 4,
  shareability: 3,
  audioVisualEngagement: 4,
  topicRelevance: 5,
};

function validCandidates() {
  return Array.from({ length: 5 }, (_, index) => ({
    start: index * 30,
    end: index * 30 + 20,
    hook: `Hook ${index + 1}`,
    explanation: "Clear standalone moment with an engaging payoff.",
    scores: { ...scores },
  }));
}

test("calculates weighted score on a 0–100 scale", () => {
  assert.equal(calculateTotalScore({
    hookStrength: 5,
    emotionalImpact: 5,
    storyCompleteness: 5,
    entertainmentOrInformation: 5,
    shareability: 5,
    audioVisualEngagement: 5,
    topicRelevance: 5,
  }), 100);
  assert.equal(calculateTotalScore({
    hookStrength: 1,
    emotionalImpact: 1,
    storyCompleteness: 1,
    entertainmentOrInformation: 1,
    shareability: 1,
    audioVisualEngagement: 1,
    topicRelevance: 1,
  }), 0);
});

test("validates five candidates and returns weighted ranking", () => {
  assert.equal(validateCandidates(validCandidates()).length, 5);
  assert.throws(() => parseGeminiCandidates("not json"), /malformed JSON/);
  assert.equal(parseGeminiCandidates(JSON.stringify({ candidates: validCandidates() })).length, 5);
});

test("rejects wrong candidate counts, invalid timestamps, and scores", () => {
  assert.throws(() => validateCandidates(validCandidates().slice(1)));
  const badTimestamp = validCandidates();
  badTimestamp[0].end = badTimestamp[0].start;
  assert.throws(() => validateCandidates(badTimestamp));
  const badScore = validCandidates();
  badScore[0].scores.hookStrength = 6;
  assert.throws(() => validateCandidates(badScore));
});

test("rejects substantially overlapping moments", () => {
  const candidates = validCandidates();
  candidates[1].start = 10;
  candidates[1].end = 28;
  assert.throws(() => validateCandidates(candidates), /overlap/);
});

test("normalizes supported public YouTube URL forms and rejects other hosts", () => {
  assert.equal(normalizeYouTubeUrl("https://youtu.be/abcdefghijk?t=20"), "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(normalizeYouTubeUrl("https://www.youtube.com/watch?v=abcdefghijk"), "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(normalizeYouTubeUrl("https://example.com/watch?v=abcdefghijk"), null);
});

test("bounds optional caption context and omits unavailable captions", () => {
  assert.equal(formatSupplementalTranscript(undefined), undefined);
  assert.equal(formatSupplementalTranscript([]), undefined);
  const transcript = formatSupplementalTranscript([{ start: 0, text: "a".repeat(25_000) }]);
  assert.equal(transcript.length, 20_000);
});

test("does not assume Gemini 400 or 404 errors mean the video is inaccessible", () => {
  for (const status of [400, 404]) {
    const result = classifyGeminiError({ status });
    assert.equal(result.status, 502);
    assert.match(result.message, /credentials, model access, and request configuration/);
    assert.doesNotMatch(result.message, /could not access.*video/i);
  }
});

test("classifies Gemini quota and provider availability errors by status", () => {
  const quota = classifyGeminiError({ status: 429 });
  assert.equal(quota.status, 429);
  assert.match(quota.message, /rate limited or out of quota/i);

  const unavailable = classifyGeminiError({ status: 503 });
  assert.equal(unavailable.status, 502);
  assert.match(unavailable.message, /temporarily unavailable/i);
});

test("returns a neutral safe fallback for unknown Gemini errors", () => {
  const result = classifyGeminiError(new Error("unexpected provider failure"));
  assert.equal(result.status, 502);
  assert.match(result.message, /check Gemini API credentials, model access, and request configuration/i);
  assert.doesNotMatch(result.message, /unexpected provider failure/);
});

test("never includes raw Gemini exception details or credential-like headers", () => {
  const rawDetails = "API_KEY=do-not-return x-goog-api-key: secret-value request headers dumped";
  const result = classifyGeminiError(Object.assign(new Error(rawDetails), { status: 400 }));
  assert.equal(result.status, 502);
  assert.doesNotMatch(result.message, /API_KEY|do-not-return|x-goog-api-key|secret-value|request headers/i);
  assert.doesNotMatch(result.message, /Gemini could not access.*video/i);
});
