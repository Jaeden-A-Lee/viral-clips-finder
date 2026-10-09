# Viral Clip Finder 🚀

An AI-powered tool that analyzes public YouTube videos and finds promising short-form clip opportunities for TikTok, YouTube Shorts, and Instagram Reels.

Built for creators who want to turn long-form content into high-performing short clips instantly.

---

## What It Does

Paste a public YouTube video URL and Viral Clip Finder will:

- Analyze video and audio content using Gemini 3.8 Flash
- Identify **five distinct clip candidates**
- Return:
  - Start and end timestamps in seconds
  - A compelling hook
  - An explanation and seven weighted editorial ratings

The ratings are a selection heuristic, not a probability of virality. The app does not create or download video clips.

---

## Why I Built It

Content creators spend hours manually watching podcasts and interviews to find short-form clips worth posting.

Viral Clip Finder automates that process by using AI to identify moments with:

- Strong emotional hooks
- Debate / controversy
- Storytelling tension
- Motivational insight
- High engagement potential

---

## Tech Stack

- **Next.js 16**
- **React**
- **TypeScript**
- **Google Gemini API** (`@google/genai`)
- **OpenAI API** (preserved transcript-based endpoint path)
- **youtube-transcript**
- **Turbopack**

---

## How It Works

### Gemini video analysis
The default UI briefly attempts to fetch YouTube captions and passes up to 20,000 characters as optional speech context when available. Caption errors or timeouts are ignored. `/api/analyze` sends the validated public YouTube URL directly to Gemini either way. It does not download the video or infer duration from transcript timestamps. Gemini returns five timestamped candidates with seven rubric ratings; the server validates the response and calculates a weighted 0–100 editorial score.

The transcript endpoint and prior OpenAI transcript analysis remain available to callers that explicitly request `provider: "openai"` and include transcript segments. That path continues to return three candidates and is not used by the default UI flow.

Gemini's direct YouTube URL input is currently documented by Google as a preview and supports public videos only. The default static video mode samples frames at 1 FPS; fast visual events can be missed. Candidate timestamps are model estimates: the server checks that they are finite, nonnegative, ordered, and rejects pairs that overlap by more than half of the shorter moment, but it cannot verify their upper bound because the app does not independently retrieve source duration. A real-video check requires a configured `GEMINI_API_KEY`; no key is needed for local validation tests.

The 0–100 editorial score normalizes each 1–5 rating and applies these weights: hook strength 20%, emotional impact 20%, story completeness 15%, entertainment/informational value 15%, shareability 15%, audio/visual engagement 10%, and topic relevance 5%. This is a heuristic, not a probability of virality.

---

## Running Locally

Install dependencies:

```bash
npm install
```

Create a `.env.local` file with the server-side keys for the provider paths you use:

```env
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
```

Run the development server:

```bash
npm run dev
```

Open:

```bash
http://localhost:3000
```

---

## Example Use Cases

- Podcast clipping
- Creator repurposing
- Shorts generation
- Social media content strategy
- Highlight extraction

---

## Future Improvements

- Direct clip export
- Generated video clips
- Virality scoring
- Downloadable timestamps
- Auto-caption generation
- TikTok / Shorts optimization suggestions

---

## Demo

Paste a YouTube podcast URL → Generate clips → Instantly get timestamped viral moments.

---

## Built By

Jaeden Lee

Built for the Codex Creator Challenge
