# MVP 1.5 clip selection evaluation

This folder is a small, human-first evaluation record for clip selection. It does not change the application or its scoring logic. The production Gemini model is `gemini-3.8-flash`; the API asks for five candidates and the application calculates and sorts its existing weighted scores (see `app/api/analyze/route.ts` and `app/lib/clip-analysis.ts`).

## First controlled comparison

1. Use the same four `primary` videos in `videos.csv` for baseline A. Do not include the optional `sanity_check` video in primary results.
2. Confirm caption availability for each run. The app attempts caption retrieval; when available, it appends bounded transcript text as supplemental context. Record whether it was available rather than assuming it was.
3. In local development, click **Download Evaluation JSON** after each successful analysis. Save/move the downloaded file unchanged into `evaluation/mvp-1.5/raw/`. The export wraps the complete API response with experiment metadata; it contains no request headers or API keys. Raw files are ignored by Git and remain the source records.
4. Generate the CSV from those saved JSON files by running this from the repository root:

   ```sh
   node evaluation/mvp-1.5/scripts/generate-run-log.mjs
   ```

   This rebuilds `evaluation/mvp-1.5/run-log.csv` from scratch, so rerunning it does not append duplicate rows. It leaves each raw JSON file unchanged. The script assigns `run_number` within each `(prompt_version, video_id)` group, ordered by UTC analysis timestamp, then run ID and filename for ties. It skips malformed JSON and skips every file sharing a duplicate run ID; warnings are printed and the command exits nonzero for these problems while still writing rows from unambiguous valid files. Missing metadata stays blank and is reported.
5. Import `evaluation/mvp-1.5/run-log.csv` into the Run Log tab in Google Sheets: select **File → Import → Upload**, choose the CSV, and import it into the existing sheet (or replace the tab's contents for a full rebuild). Check that comma-separated values land in the matching columns. If the sheet already contains manual edits, copy those into the source JSON metadata or a separate notes copy before replacing it; generated CSV is reproducible output.
6. Rate each of the five returned candidates using `human-ratings-template.csv`. Use the returned rank (the app sorts candidates by weighted total score) and rate what the selected interval actually contains. Review the video around each proposed interval before judging boundary accuracy. Keep human ratings independent from Gemini's own scores.
7. Later, compare with prompt B by changing one prompt element only. Use the same four videos, model, transcript availability/input, processing settings, schema, and review rubric. Save raw outputs and log them in the same way. Blind prompt labels while rating if practical.
8. Repeat selected cases only when studying run-to-run variability. Keep the prompt and all other settings fixed for those repeats, and give every request a distinct run ID and run number.

### Logged metadata and manual fields

The download metadata captures a browser-generated UUID, the UTC time immediately before the `/api/analyze` request, video ID from the URL used for that request, the model ID returned in the API's `x-analysis-model` response header, the configured prompt version, whether supplemental transcript text was actually supplied, transcript retrieval status, and the known video/generation settings. The API model header comes from the route's `GEMINI_MODEL` constant, so it tracks the actual configured model without duplicating that constant in the client. The prompt version is explicitly set as `EVALUATION_PROMPT_VERSION` in `app/page.tsx`; update that value when conducting prompt B. The timestamp uses the browser's system clock.

`transcript_available` means the transcript endpoint successfully returned a non-empty segments array (`yes`), successfully returned an empty array (`no`), or availability could not be determined (`unknown`, such as a timeout or error). `supplemental_transcript_used` separately records whether formatted text was included in the Gemini request. A transcript can be available without usable text being supplied; do not treat the two fields as interchangeable.

The current route does not explicitly configure video processing or generation settings. The export records that those settings were omitted and API/model defaults applied; it does not guess the underlying effective defaults. `reviewer` and `observations` remain optional and blank in the generated CSV so they can be filled in manually. Missing model, prompt, video, timestamp, transcript, or processing metadata is never inferred by the generator: it leaves the cell blank and prints a warning. A run number is assigned only when both prompt version and video ID are present.

For a first pass, report the human ratings and pairwise preferences descriptively. The candidate set is small; use results to find clear failures and decide the next experiment rather than making broad claims from four videos.

## Human rating scale

Use ratings from **1 to 5**, allowing **0.5 increments**, for subjective quality fields: 1 = poor, 2 = weak, 3 = mixed/acceptable, 4 = strong, 5 = excellent. Use the same interpretation across videos and prompt versions. Leave unprovided ratings blank. `candidate_rank` preserves Gemini's returned ranking; `human_preference_rank` records the reviewer's personal ranking separately. `notes` can explain meaningful disagreements or uncertainty.

Record `start_boundary_error_seconds` and `end_boundary_error_seconds` as signed errors: **proposed timestamp minus preferred timestamp**. Leave unmeasured errors blank. Calculate `timestamp_boundary_accuracy_1_5` from the maximum absolute start/end error when both errors are recorded:

| Maximum absolute error | Boundary-accuracy score |
| --- | --- |
| 0 seconds | 5.0 |
| 1 second | 4.5 |
| 2 seconds | 4.0 |
| 3–4 seconds | 3.5 |

Boundary-accuracy scores in the Stephen Curry benchmark were calculated after the initial review from the recorded timestamp errors. This rubric has not been validated beyond this benchmark. Errors outside the listed ranges have no defined score under this rubric; leave the score blank pending an explicit rubric extension.

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
- `scripts/generate-run-log.mjs`: rebuilds `run-log.csv` from saved files in `raw/` using only Node.js built-ins.
- `raw/`: local downloaded JSON records; ignored by Git.
- `run-log.csv`: generated import file for the Run Log sheet.
- `prompts/baseline-A.md`: production Gemini prompt and separately documented runtime suffix.
