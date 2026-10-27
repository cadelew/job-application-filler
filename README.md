# Job Application Autofill

Local-only Chrome extension (Manifest V3) that autofills high-confidence fields on job application forms. Your profile stays in `chrome.storage.local`. No network requests, no LLM, no automatic submit.

## Requirements

- Node 22+
- [pnpm](https://pnpm.io/)

## Setup

```bash
pnpm install
```

## Develop

```bash
pnpm dev
```

Opens Chromium with the extension loaded. Use the Options page to save a profile, open a local fixture under `tests/fixtures/`, then click **Fill high-confidence fields** in the popup.

## Build

```bash
pnpm build
```

Output: `.output/chrome-mv3/` (load unpacked in Chrome if you want).

## Typecheck & unit tests

```bash
pnpm compile
pnpm test
```

## End-to-end tests

Build first, then run Playwright against the unpacked extension:

```bash
pnpm build
pnpm test:e2e
```

E2E launches **headed** Chromium with the extension loaded (Playwright extension testing requires non-headless Chromium). It serves fixtures from `tests/fixtures/`, seeds a sample profile, injects the runtime content script, and asserts fills, prefilled preservation, and that submit never fires.

Note: because Playwright cannot reliably click the toolbar action (which is what grants `activeTab`), the e2e suite temporarily adds `http://127.0.0.1/*` host permissions to the **built** `.output/chrome-mv3/manifest.json` before loading. Production `pnpm build` / `pnpm dev` still ship with only `activeTab`, `scripting`, and `storage`.

## Permissions

- `activeTab` — temporary access when you invoke the extension
- `scripting` — inject the autofill content script into the active tab
- `storage` — persist your profile locally

## Safety rules (MVP)

- Never submits or clicks Apply/Next
- Does not overwrite nonempty fields
- Skips sensitive questions (work auth, sponsorship, demographics, salary, “how did you hear”, etc.)
- Stores `answers.*` but does not autofill them yet
