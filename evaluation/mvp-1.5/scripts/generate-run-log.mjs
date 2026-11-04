#!/usr/bin/env node

import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const evaluationDirectory = resolve(scriptDirectory, "..");
const projectDirectory = resolve(evaluationDirectory, "../..");
const rawDirectory = join(evaluationDirectory, "raw");
const templatePath = join(evaluationDirectory, "run-log-template.csv");
const outputPath = join(evaluationDirectory, "run-log.csv");

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function timestampOrder(value) {
  if (typeof value !== "string" || !value.trim()) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function readString(metadata, key, filename, warnings) {
  const value = metadata[key];
  if (typeof value === "string" && value.trim()) return value;
  warnings.push(`${filename}: metadata.${key} is missing; leaving the CSV cell blank.`);
  return "";
}

async function main() {
  const warnings = [];
  await mkdir(rawDirectory, { recursive: true });

  const template = await readFile(templatePath, "utf8");
  const columns = template.split(/\r?\n/, 1)[0].split(",");
  if (columns.join(",") !== "model_id,prompt_version,video_id,run_number,run_id,test_date,processing_settings,transcript_available,raw_output_location,reviewer,observations") {
    throw new Error("Run-log template columns do not match the expected schema.");
  }

  const filenames = (await readdir(rawDirectory))
    .filter((filename) => filename.toLowerCase().endsWith(".json"))
    .sort(compareText);
  const parsedRuns = [];

  for (const filename of filenames) {
    const fullPath = join(rawDirectory, filename);
    let document;
    try {
      document = JSON.parse(await readFile(fullPath, "utf8"));
    } catch (error) {
      warnings.push(`${filename}: malformed/unreadable JSON; skipped (${error.message}).`);
      continue;
    }

    if (!isRecord(document) || !isRecord(document.metadata) || !isRecord(document.response)) {
      warnings.push(`${filename}: expected an object with metadata and response objects; skipped.`);
      continue;
    }
    const runId = document.metadata.run_id;
    if (typeof runId !== "string" || !runId.trim()) {
      warnings.push(`${filename}: metadata.run_id is missing; skipped because duplicate detection is not possible.`);
      continue;
    }
    parsedRuns.push({ filename, metadata: document.metadata, runId });
  }

  const runIdCounts = new Map();
  for (const run of parsedRuns) {
    runIdCounts.set(run.runId, (runIdCounts.get(run.runId) ?? 0) + 1);
  }
  const duplicateIds = new Set([...runIdCounts].filter(([, count]) => count > 1).map(([runId]) => runId));
  for (const runId of duplicateIds) {
    const duplicateFiles = parsedRuns.filter((run) => run.runId === runId).map((run) => run.filename).sort();
    warnings.push(`Duplicate run_id ${runId}; skipped all matching files: ${duplicateFiles.join(", ")}.`);
  }

  const validRuns = parsedRuns.filter((run) => !duplicateIds.has(run.runId));
  const rowRecords = validRuns.map(({ filename, metadata, runId }) => {
    const promptVersion = readString(metadata, "prompt_version", filename, warnings);
    const videoId = readString(metadata, "video_id", filename, warnings);
    const modelId = readString(metadata, "model_id", filename, warnings);
    let timestamp = readString(metadata, "analysis_timestamp_utc", filename, warnings);
    if (timestamp && (!timestamp.endsWith("Z") || !Number.isFinite(Date.parse(timestamp)))) {
      warnings.push(`${filename}: metadata.analysis_timestamp_utc is not a valid UTC timestamp; leaving date blank and sorting it last.`);
      timestamp = "";
    }
    const transcriptAvailable = readString(metadata, "transcript_available", filename, warnings);
    const processingSettings = metadata.processing_settings;

    if (processingSettings === undefined || processingSettings === null) {
      warnings.push(`${filename}: metadata.processing_settings is missing; leaving the CSV cell blank.`);
    }
    return {
      filename,
      runId,
      timestamp,
      promptVersion,
      videoId,
      row: {
        model_id: modelId,
        prompt_version: promptVersion,
        video_id: videoId,
        run_number: "",
        run_id: runId,
        test_date: timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "",
        processing_settings: processingSettings == null ? "" : typeof processingSettings === "string" ? processingSettings : JSON.stringify(processingSettings),
        transcript_available: transcriptAvailable,
        raw_output_location: relative(projectDirectory, join(rawDirectory, basename(filename))),
        reviewer: typeof metadata.reviewer === "string" ? metadata.reviewer : "",
        observations: typeof metadata.observations === "string" ? metadata.observations : "",
      },
    };
  });

  const runGroups = new Map();
  for (const record of rowRecords) {
    if (!record.promptVersion || !record.videoId) continue;
    const key = JSON.stringify([record.promptVersion, record.videoId]);
    const group = runGroups.get(key) ?? [];
    group.push(record);
    runGroups.set(key, group);
  }
  for (const group of runGroups.values()) {
    group.sort((a, b) =>
      timestampOrder(a.timestamp) - timestampOrder(b.timestamp) ||
      compareText(a.runId, b.runId) ||
      compareText(a.filename, b.filename),
    );
    group.forEach((record, index) => { record.row.run_number = String(index + 1); });
  }

  rowRecords.sort((a, b) =>
    compareText(a.videoId, b.videoId) ||
    compareText(a.promptVersion, b.promptVersion) ||
    timestampOrder(a.timestamp) - timestampOrder(b.timestamp) ||
    compareText(a.runId, b.runId) ||
    compareText(a.filename, b.filename),
  );

  const csv = [
    columns.join(","),
    ...rowRecords.map(({ row }) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n") + "\n";
  await writeFile(outputPath, csv, "utf8");

  for (const warning of warnings) console.warn(`WARNING: ${warning}`);
  console.log(`Wrote ${rowRecords.length} run-log row(s) to ${relative(projectDirectory, outputPath)}.`);
  if (duplicateIds.size || warnings.some((warning) => warning.includes("malformed/unreadable JSON") || warning.includes("expected an object") || warning.includes("run_id is missing"))) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
