# MVP 1.5 clip selection evaluation

This folder is a small, human-first evaluation record for clip selection. It does not change the application or its scoring logic. The production Gemini model is `gemini-3.8-flash`; the API asks for five candidates and the application calculates and sorts its existing weighted scores (see `app/api/analyze/route.ts` and `app/lib/clip-analysis.ts`).

## First controlled comparison

1. Use the same four `primary` videos in `videos.csv` for baseline A. Do not include the optional `sanity_check` video in primary results.
2. Confirm caption availability for each run. The app attempts caption retrieval; when available, it appends bounded transcript text as supplemental context. Record whether it was available rather than assuming it was.
3. Save each unedited response in a local raw-output folder, for example `evaluation/mvp-1.5/raw/`. Record the relative path and run settings in `run-log-template.csv`. Do not store keys, headers, or other secrets. Preserve the full response so candidate order, scores, and text remain reviewable.
4. Rate each of the five returned candidates using `human-ratings-template.csv`. Use the returned rank (the app sorts candidates by weighted total score) and rate what the selected interval actually contains. Review the video around each proposed interval before judging boundary accuracy. Keep human ratings independent from Gemini's own scores.
5. Later, compare with prompt B by changing one prompt element only. Use the same four videos, model, transcript availability/input, processing settings, schema, and review rubric. Save raw outputs and log them in the same way. Blind prompt labels while rating if practical.
6. Repeat selected cases only when studying run-to-run variability. Keep the prompt and all other settings fixed for those repeats, and give every request a distinct run ID and run number.

For a first pass, report the human ratings and pairwise preferences descriptively. The candidate set is small; use results to find clear failures and decide the next experiment rather than making broad claims from four videos.

## Human rating scale

Use integer ratings from **1 to 5** for subjective quality fields: 1 = poor, 2 = weak, 3 = mixed/acceptable, 4 = strong, 5 = excellent. Use the same interpretation across videos and prompt versions. `timestamp_boundary_accuracy` uses the same scale as an overall judgment; also enter `start_boundary_error_seconds` and `end_boundary_error_seconds` when you can compare the proposed boundaries with a human-judged usable cut. Record signed error consistently (proposed timestamp minus judged timestamp); leave it blank if not measured. `notes` can explain meaningful disagreements or uncertainty.

## Baseline prompt and runtime details

`prompts/baseline-A.md` contains the fixed production prompt wording. The optional transcript suffix is a dynamic addition, documented separately in that file; its presence varies by video/run. Production sends a native video URI and a text input using the Interactions API, and requests the existing JSON schema: exactly five candidates with numeric `start`/`end`, `hook`, `explanation`, and seven integer 1–5 dimensions. Keep that contract and the existing weighted calculation unchanged during prompt evaluation.

The current weights are: hook strength 20%, emotional impact 20%, story completeness 15%, entertainment/information 15%, shareability 15%, audio/visual engagement 10%, and topic relevance 5%. `calculateTotalScore()` maps the 1–5 values to a 0–100 weighted score; `validateCandidates()` rejects invalid candidate counts, fields, scores, or substantial overlap and sorts by total score. This evaluation adds no replacement score or automated judge.

## Video length, rate, and token limits

Google's Gemini API video guide currently states that the free tier may process up to **8 hours of YouTube video per day**. It also limits YouTube input to public videos. That is a daily allowance, not a guarantee that a particular request will succeed; model, project, account, and service limits still apply. [Video understanding limits](https://ai.google.dev/gemini-api/docs/video-understanding)

Gemini API rate limits are model- and usage-tier-dependent and include requests per minute (RPM), input tokens per minute (TPM), and requests per day (RPD). Google says the active limits should be checked in AI Studio; limits can change and are applied per project. Video processing and transcript text both contribute to input usage, so four benchmark calls plus any repeats still need to fit the current quota. [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Token counting and video usage](https://ai.google.dev/gemini-api/docs/tokens)

The four benchmark videos' durations and caption availability have not been verified here, so those cells are marked `unknown`. Check current account/project quota and the current official limits before running. This setup step made no model/API calls.

## Files

- `videos.csv`: four primary benchmark videos and one optional sanity-check video.
- `human-ratings-template.csv`: one row per rated candidate.
- `run-log-template.csv`: one row per model run, ready to compare prompt A with prompt B.
- `prompts/baseline-A.md`: production Gemini prompt and separately documented runtime suffix.
