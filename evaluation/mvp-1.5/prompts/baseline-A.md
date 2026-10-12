# Baseline A — production Gemini analysis prompt

The following is the exact fixed prompt text in `app/api/analyze/route.ts`. Runtime transcript insertion is documented below and is not silently included in the fixed text.

```text
Find the five strongest distinct short-form clip moments in this public YouTube video. Score each dimension from 1 (weak) to 5 (exceptional), using 2 and 4 for intermediate quality: hook strength (20%, opening attention); emotional impact (20%, intensity or resonance); story completeness (15%, understandable setup and payoff); entertainment or informational value (15%, amusing or useful); shareability (15%, likely to prompt sharing or discussion); audio/visual engagement (10%, compelling delivery, reactions, or visuals); topic relevance (5%, fit for an audience interested in this video's subject). Return timestamps as numeric seconds from the beginning of the complete source video, using the video timeline as evidence; do not invent or shift timestamps. Each moment should stand alone, have a concise hook, and explain why it could work as a short clip. Avoid substantially overlapping moments. The scores are editorial judgments, not probabilities.
```

## Dynamic runtime addition

When `formatSupplementalTranscript(captionContext)` returns transcript text, production appends this exact suffix after the fixed prompt (with the transcript substituted for `${transcriptText}`):

```text

Optional YouTube caption transcript for speech context (caption timestamps are supplemental only; use the video timeline as the authority):
${transcriptText}
```

If no usable transcript is available, that suffix is omitted. The input also contains a separate native video block with the normalized YouTube URL. The route requests the existing structured response schema: one object with a `candidates` array of exactly five objects, each containing numeric `start`, numeric `end`, string `hook`, string `explanation`, and `scores` with integer values 1–5 for `hookStrength`, `emotionalImpact`, `storyCompleteness`, `entertainmentOrInformation`, `shareability`, `audioVisualEngagement`, and `topicRelevance`. This schema is API configuration, not part of the natural-language prompt above.
