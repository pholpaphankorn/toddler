---
title: forge, repository and issues replace openPr
labels: []
blocked_by: [38, 50]
parent: 3
status: closed
---
Replace `openPr` and the old `issues` values with the one-host config shape, built on the seams from #50.

1. **Shape** in `.sandcastle/config.json`:
   ```json
   "forge": "github" | "gitlab" | "none",   // default "github"
   "repository": "owner/name",
   "issues": "files" | "forge"              // default "forge" with a forge, else "files"
   ```
   `{"repository": "owner/name"}` alone keeps today's behaviour. `"none"` replaces offline mode: nothing is pushed. Any other forge always opens a pull request; there is no switch. `"gitlab"` is accepted by the schema but fails with "not supported yet" until #54.
2. **Runner wiring**: `connect(config.forge)` builds the forge; the tracker is the files tracker when `issues: "files"`, else `forge.tracker`.
3. **Validation at load**, each error naming its config path:
   - `issues: "forge"` with `forge: "none"`
   - missing or malformed `repository` with a forge (`github` → `owner/name`)
   - `repository` with `forge: "none"` ("only used with a forge"); infant keeps an internal placeholder to key its state file
4. **Obsolete keys**: `openPr`, `issues: "github"` and `issues: "local"` fail with an "obsolete setting" error saying what to write instead (e.g. `issues: "local"` → `"files"` and set `forge`), like `reservePercent`.
5. **`init`** writes `{ forge, repository?, install: "", verify: "" }`: `forge` always (even `"github"`), `repository` only with a forge. Detection stays `gh repo view`, else `none`. Next steps: GitHub — label issues `<issueLabel>` or set `"issues": "files"`; none — how to write issue files and that nothing is pushed.
6. **`doctor`** runs the forge's `doctorChecks`. With `issues: "forge"`, FAIL if the `issueLabel` label doesn't exist. OK/FAIL only.
7. **This repo's own config**: `.sandcastle/config.json` here uses `"issues": "local", "openPr": true`, which this issue makes obsolete. Change it to `"forge": "github", "issues": "files"` (keep `repository`, `install`, `verify`) in the same commit, so the next infant run on this repo still loads.

Done when tests cover the defaults, each validation error and its path, each obsolete-key error, `init`'s written config for GitHub and none, and the `issueLabel` check, and this repo's `.sandcastle/config.json` loads with the new shape. The README config table documents `forge`, `repository`, `issues` and the `GH_HOST` env var, and drops `openPr`.

Decision records: [44](44-tracker-forge-config.md), [49](49-init-doctor-per-forge.md).
