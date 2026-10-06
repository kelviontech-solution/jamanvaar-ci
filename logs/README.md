# Generated logs

Store development, build, test and tool output logs in this directory instead of the repository root. Existing `.codex-*.log` files were moved here with their names and contents preserved.

Generated contents are excluded from Git and Docker build contexts. This guide remains tracked. QA reports and their linked evidence stay in `docs/reports/`; private QA state stays in `.jamanvaar/`.

For example, from the repository root in PowerShell:

```powershell
npm run typecheck *> logs/typecheck.log
```
