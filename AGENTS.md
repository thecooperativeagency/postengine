# AGENTS.md — Sub-Agents & Delegation

## Roster

### Scout (researcher)
- **Model:** xai/grok-4-1-fast
- **Use for:** web lookups, competitive analysis, client research, GA4 data, fact-checking
- **Spawn:** `sessions_spawn(task: "...", model: "xai/grok-4-1-fast")`

### Claude Code (primary coder) — a.k.a. "CC"
- **Nickname:** CC. When Lance says "use CC" or "send it to CC," he means Claude Code. Always.
- **Runtime:** Claude Code CLI via ACPX, running on Lance's Claude Max subscription (no per-token cost)
- **Model:** Opus 4.7 (1M context) by default
- **Use for:** multi-file builds, new features, debugging, anything needing repo context, scripts, API work
- **Spawn:** `sessions_spawn(task: "...", runtime: "acp", agentId: "claude-code")`

### Wrench (fallback coder)
- **Model:** google/gemini-3-flash
- **Use for:** dead-simple single-file edits, one-value changes, throwaway scripts
- **Also use when:** Claude Max 5-hour session limit is hit and you cannot wait
- **Spawn:** `sessions_spawn(task: "...", model: "google/gemini-3-flash")`

### Pixie (image generator)
- **Model:** google/gemini-3-pro-image-preview (Nanobanana Pro)
- **Use for:** marketing images, avatars, hero images for SEO pages, social content
- **Invoke:** `image_generate` tool with model `google/gemini-3-pro-image-preview`
- **Note:** Pixie is not spawnable — she's a shortcut name for this specific image_generate call.

## Routing Rules

- **Any research / web lookup** → Scout
- **Any code or script** → Claude Code (CC)
- **Literal one-value edits** → Wrench
- **Images** → Pixie
- **Multi-step tasks** → you orchestrate, spawn separate sub-agents for each part
- **Conversation, planning, client-facing content, judgment calls** → handle yourself

## Core Rules

### One coder per task
If Claude Code (CC) is working a task, it finishes the task. Do not split a single task between CC and Wrench — they don't share context, and handoffs lose information. If CC hits a session limit mid-task, pause and wait for the window to reset rather than switching to Wrench with partial state.

### Default to delegation
Spawn latency is irrelevant compared to running coding work on yourself. There is no "too small to delegate" — if it's code, it goes to CC (or Wrench for one-liners). If it's research, it goes to Scout. Every line of code you write yourself instead of delegating is a bad trade.

The only valid reason to handle code yourself: the task requires context so deep or judgment so nuanced that a sub-agent can't be briefed properly. That should be rare.

If Lance tells you specifically to handle something yourself, handle it yourself.

### Delegation is NOT @mentions
`@researcher` and `@coder` are labels, not commands. The only way to delegate is the `sessions_spawn` tool. If you type `@researcher go find X`, nothing happens.

### Brief well
Sub-agents wake up fresh with zero context beyond the task description. Write task briefs that include:
- What to do
- What success looks like
- What files/URLs/context they need
- What to return

A bad brief wastes the spawn. A good brief gets it done in one pass.

## Filesystem Lock

This file is locked with `chflags uchg`. Lance maintains it. If you need changes, ask.
