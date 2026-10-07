# Codex grey panel investigation — 7 October 2026

**User-reported result:** the user subsequently confirmed that the grey-screen error was resolved. Independent observation over a full 15–20 minute session was not available; the specific causal fault remains unconfirmed.

The screenshot shows a blank Codex webview in a floating VS Code panel. This is an editor issue, separate from the restaurant frontend.

## Confirmed local evidence

- VS Code renderer logs record repeated local extension-host unresponsiveness on 7 October, including 12:24–12:27 and 12:46.
- A previous renderer log records `Render frame was disposed before WebFrameMain could be accessed` at 12:21:31.
- The 12:27 CPU profile covers approximately 350 ms. About 296 ms of recorded samples belong to TypeScript language features. This is evidence of TypeScript work during that sample, not proof that TypeScript caused the blank panel.
- The 12:46 profile covers approximately 222 ms, with only six samples. About 218 ms is unattributed program time and about 3.6 ms belongs to the Codex extension. The log's percentage attribution alone is insufficient to identify a culprit.
- Codex logs also contain recurring `ResizeObserver loop completed with undelivered notifications` messages and HTTP 403 responses from account-related endpoints. Neither establishes the cause of the grey panel. No confirmed GPU crash or out-of-memory event was found in the inspected logs.
- The installed extension is `openai.chatgpt-26.1002.51308-win32-x64`. The extension installation check reported that it was already installed; an upgrade was not confirmed.

## Change applied

Added workspace `.vscode/settings.json` exclusions for node_modules, build output, task logs, generated canonical menu photos and their copied public assets. Source files remain watched. This reduces avoidable file-change activity while hundreds of photos are packaged into six public directories. It is a mitigation for editor load, not a verified repair of the Codex renderer.

The issue recurred after watcher exclusions. Enabled `disable-hardware-acceleration` in the existing VS Code runtime arguments, preserving every other setting and backing up the original as `argv.before-codex-grey-panel-20261007.json` beside it. This enables software rendering after a **complete VS Code restart**, not just a window reload. VS Code documents disabling GPU acceleration as a blank-window workaround: https://code.visualstudio.com/docs/supporting/faq#_vs-code-is-blank. Applying it here is a controlled mitigation; the logs do not establish a GPU fault. The active editor was not restarted during asset generation.

No Codex account data, conversation history, authentication state or vendor extension files were changed. Raw editor logs and CPU profiles are not copied into this repository because they can contain private session details.

## Remaining verification and recovery

The extension panel cannot be independently inspected or repaired through the repository test harness. Once active tasks finish, save files and completely exit/reopen VS Code to activate software rendering. Check whether it remains stable for at least 15–20 minutes. Also open Codex in the main sidebar using **Open Codex Sidebar**, avoiding the floating panel for comparison. If only the floating panel fails, that narrows the problem to the auxiliary window/webview lifecycle. If both fail, record the timestamp and inspect renderer and Codex logs from the same session. Official troubleshooting recommends restarting after active chats complete when the interface remains stuck: https://learn.chatgpt.com/docs/reference/troubleshooting. Revert the mitigation by restoring the backed-up runtime arguments if it does not help.
