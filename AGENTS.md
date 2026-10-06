# Agent guide

Tool-agnostic guide for any coding agent (Codex, Cursor, Claude Code, or another) working in this repo. `AGENTS.md` is the one standard: an agent either reads it or it does not — the repo carries no per-tool shim files (`CLAUDE.md`, `.cursor/rules/`, etc.). A tool that ignores `AGENTS.md` is a limitation of that tool, not something the repo works around.

## The one rule that outranks this file

**Humans are the first developers. [README.md](README.md) outranks this file.** It is the human-facing explanation of the order book and how to run it. This file holds only agent-specific operational hints: how to navigate, build, and run the repo.

## What this repo is

A teaching example: a single-symbol, in-memory central limit order book with price-time priority matching, exposed over a small HTTP API. It was generated from the Bun TypeScript template, with Biome for lint and format and a strict ESNext `tsconfig`.

- **Readability is the feature.** The code exists to be read by someone learning how a CLOB works. Prefer the clear data structure over the fast one, keep the explanatory comments accurate when the code changes, and keep the README's worked examples and `curl` walkthrough in sync with behaviour.
- **No new dependencies without a teaching reason.** `Bun.serve` is the HTTP layer; there is no framework, database, or auth on purpose. The README's "What is deliberately missing" list is the backlog of exercises, not a to-do list.
- The engine (`src/orderbook/`) is pure: no I/O, no clock, no randomness. Input validation lives in `validation.ts` and the HTTP adapter in `src/server.ts`; trading logic stays out of both.
- Prices and quantities are positive integers (ticks and lots). Never introduce floating-point prices.
- Application code lives under `src/`; tests sit beside it in `src/__tests__/`.
- `src/config.ts` is the pattern for configuration: a `convict` schema with defaults and environment variable bindings, validated once at startup. Extend it rather than reading `process.env` from scattered call sites.
- **Tools are pinned with `mise` in [.mise.toml](.mise.toml)**, like every other repo in the set. Add or bump a tool there, never with a global install.

## Working in the repo

- Tasks are mise tasks, run with `mise run <task>`: `setup`, `start`, `dev`, `test`, `lint`, `format`, `check`, `ci`. `ci` is exactly what the pre-push hook and the GitHub workflow run. The `package.json` scripts only delegate to them; define a task in `.mise.toml`, not as a script.
- `mise install` installs the pinned tools and `mise run setup` installs dependencies and the git hooks. Outside an activated mise shell, run a tool as `mise x -- <tool>`; a bare call resolves from `PATH` at an unpinned version, or not at all.
- Git hooks call every tool through `mise x` (and find lefthook itself through the `lefthook:` key in [.lefthook.yml](.lefthook.yml)), because a hook has no active mise shell. Keep it that way: without it, lefthook's generated script falls back to other package managers such as `pnpm`, which install their own lockfile.
- `bun.lock` is committed and authoritative. Change dependencies with `bun add` / `bun remove`, never by hand-editing the lock file.
- Bun runs TypeScript directly — there is no build step and no `dist/`. `mise run dev` watches and reloads.
- Before finishing a change, run `mise run check`, which is `lint` (Biome with warnings as errors, `tsc --noEmit`, and a gitleaks secret scan) and `test`; `mise run format` applies Biome's fixes.
- The bun version lives in two places that must move together: `.mise.toml` and `packageManager` in `package.json`.

## Conventions

- **Biome is the arbiter** for both lint and format, configured in [biome.json](biome.json). Run `mise run format`; never hand-format to match a preference the formatter will undo.
- **The `tsconfig` is strict on purpose.** Fix the type, do not reach for `any` or `@ts-ignore`; if a cast is genuinely required, narrow it and comment why.
- Use `bun:test` for tests, with one file per module under `src/__tests__/`.
- Prefer named exports and explicit module paths. The project is ESM (`"type": "module"`) — no `require`.

## Commits

- **Conventional Commits, enforced.** `cog verify` runs on `commit-msg` and `cog check` plus `mise run ci` on `pre-push`, so a malformed message is rejected locally before CI sees it.
- Commit messages are a title only — no body, no footer.
- Never push unless asked to.
