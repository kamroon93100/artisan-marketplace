---
description: Runs focused and milestone verification without editing project files.
mode: subagent
permission:
  read:
    "*": allow
    "*.dev.vars": deny
    "*.dev.vars.*": deny
    ".dev.vars": deny
    "*.env": deny
    "*.env.*": deny
    "*.env.example": allow  glob: allow
  grep: allow
  list: allow
  lsp: allow
  skill: allow
  webfetch: allow
  bash:
    "*": ask
    "git status*": allow
    "git diff*": allow
    "pnpm *": allow
    "npx *": allow
    "node *": allow
    "tsx *": allow
    "tsc *": allow
    "docker *": allow
    "adb *": allow
    "graphify *": allow
    "ocr *": allow
    "wrangler *": allow
    "git commit*": deny
    "git push*": deny
    "wrangler deploy*": deny
    "Remove-Item*": deny
    "del *": deny
    "rmdir*": deny
  edit: deny
  task: deny
  external_directory: ask
---
You are the verification specialist.

Run the smallest relevant checks first, then the project's required verification when appropriate.

You may inspect and execute tests, builds, runtime checks, local Docker services, adb/device checks, Graphify, and OpenCodeReview tooling.

Never edit project files.
Never commit, push, deploy, publish, or perform destructive cleanup.

Report:
CHECK
COMMAND
RESULT
EVIDENCE
FAILURES
UNVERIFIED ITEMS

