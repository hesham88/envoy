# `@envoy/cli` — `envoy-guard` Coding-Agent Hook

**Use Envoy with your favourite coding agent:** `envoy-guard` intercepts secrets, personal data, and your own custom terms before they leave your machine to a cloud coding agent.

> **Protection level — Basic protection (rules-only):**
> Node.js does not have Chrome's on-device model or Firebase AI Logic browser inference, so `envoy-guard` runs `@envoy/core`'s fast deterministic `scanText()` engine (`SECRET` keys/tokens/PEM/JWT/passwords, national IDs, IBANs, Luhn cards, phones, emails, money, dates, addresses, plus your `~/.envoy/rules.json` `CustomRule[]`). It never makes network calls.

---

## Supported Agents (Verified Hook Contracts)

### 1. Claude Code (`UserPromptSubmit` + `PreToolUse`)
- **`UserPromptSubmit`:** Scans every submitted prompt. When sensitive items are found, blocks submission (`decision: "block"`) with a reason listing the finding types and a **ready-to-paste masked copy**.
  - **Honest limitation:** Claude Code's `UserPromptSubmit` hook can block a prompt or inject context, **but cannot rewrite the prompt text inline**. `envoy-guard` therefore blocks and prints the masked copy for you to paste.
- **`PreToolUse` (`WebFetch|Bash|Write|Edit`):** Scans outbound tool inputs and denies execution (`permissionDecision: "deny"`) if raw secrets or personal data are detected.

Print the exact `.claude/settings.json` snippet (never edits your settings automatically):
```bash
npx envoy-guard init claude
```

### 2. Gemini CLI (`BeforeAgent` + `BeforeTool`)
- **`BeforeAgent`:** Scans submitted prompts and returns strict JSON `{"decision": "deny", "reason": "..."}` with a masked copy when sensitive data is found, or `{"decision": "allow"}` when clean.
- **`BeforeTool` (`web_fetch|run_shell_command|write_file|replace`):** Scans outbound tool parameters and returns `{"decision": "deny", ...}` if secrets or personal data are detected.

Print the exact `.gemini/settings.json` snippet (never edits your settings automatically):
```bash
npx envoy-guard init gemini
```

---

## Custom Rules (`~/.envoy/rules.json`)

Add project codenames, client names, or internal ticket regexes in `~/.envoy/rules.json` (or set `ENVOY_RULES_PATH`):

```json
[
  { "label": "PROJECT", "terms": ["Project Falcon", "Helios"] },
  { "label": "TICKET", "pattern": "INT-\\d{4}" }
]
```

## Build & Standalone Scan

```bash
npm run build -w @envoy/cli
echo "My key is AIza..." | node packages/cli/dist/cli.mjs scan
```
