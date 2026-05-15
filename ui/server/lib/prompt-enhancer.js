import { readFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import matter from "gray-matter";

import { WORKSPACE } from "./paths.js";

export async function runPromptEnhancer(
  { description, mode, targetRepo },
  res,
) {
  // Load the agent soul from .claude/agents/prompt-enhancer.md (body = system prompt)
  const agentFile = await readFile(
    path.join(WORKSPACE, ".claude/agents/prompt-enhancer.md"),
    "utf8",
  );
  const systemPrompt = matter(agentFile).content.trim();

  const intent =
    mode === "investigate"
      ? "finding the root cause of a bug"
      : mode === "fix"
        ? "reporting a bug to be fixed in an existing completed task"
        : mode === "subtask"
          ? "describing a related feature or enhancement to add on top of an existing completed task"
          : "building or fixing a feature";

  const xmlHint =
    mode === "fix"
      ? "Use XML tags: <problem>, <context>, <reproduction_steps>, <expected_behavior>, <technical_details>"
      : mode === "subtask"
        ? "Use XML tags: <problem>, <context>, <requirements>, <integration_points>, <acceptance_criteria>"
        : mode === "investigate"
          ? "Use XML tags: <problem>, <context>, <reproduction_steps>, <expected_behavior>, <technical_details>"
          : "Use XML tags: <problem>, <context>, <requirements>, <technical_details>, <acceptance_criteria>";

  const userMessage = `The user wants a task for ${intent}. Their description:\n"""\n${description.trim()}\n"""\n\nTarget repository: ${targetRepo.trim()}\n\nRespond ONLY with valid JSON — no markdown, no preamble:\n{"action":"rewrite","result":"<problem>...</problem>\\n<context>...</context>\\n...","explanation":"one sentence"}\nor\n{"action":"ask","result":["question 1","question 2"],"explanation":"one sentence"}\n\nIMPORTANT: When action is "rewrite", the result MUST be structured with XML tags. ${xmlHint}. Only include tags that are relevant. Do not use plain prose — use the XML structure.`;

  // Stream NDJSON — each line is a JSON event
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (obj) => res.write(JSON.stringify(obj) + "\n");

  try {
    const proc = spawn(
      "claude",
      ["--system-prompt", systemPrompt, "-p", userMessage],
      {
        cwd: targetRepo.trim(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let fullOutput = "";

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      fullOutput += text;
      send({ chunk: text });
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        send({ error: "Claude exited with error" });
        res.end();
        return;
      }
      const match = fullOutput.match(/\{[\s\S]*\}/);
      if (!match) {
        send({ error: "Could not parse response" });
        res.end();
        return;
      }
      try {
        send({ done: true, result: JSON.parse(match[0]) });
      } catch {
        send({ error: "Invalid JSON from Claude" });
      }
      res.end();
    });

    proc.on("error", (err) => {
      send({ error: err.message });
      res.end();
    });
  } catch (err) {
    send({ error: err.message });
    res.end();
  }
}
