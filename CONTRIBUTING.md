# Contributing

Thanks for helping make this little tool useful.

Open an issue describing the behavior you want to change, or send a small pull request. Include a concrete before/after example for bug fixes.

## Development

Use Node.js 22 or newer. Run `npm ci`, `npm run build`, then `npm start` for Electron. `npm run web` runs Vite development mode; `npm run preview` serves the existing browser build. These are separate launch modes with separate storage. Windows packaging uses `npm run build:windows`; Android sync uses `npm run android:sync`. APK build tooling remains incomplete.

Keep domain logic in `src/core.js` independent of the DOM. Keep UI strings in `src/i18n.js` and `src/features-i18n.js`, in both languages. Shared validation/journaling lives in `shared/`; Electron file access belongs in `desktop/`. Treat user task text as text: use `textContent`, never HTML interpolation. Do not edit generated `dist/` files.

Before submitting:

```sh
npm run check
npm test
npm run build
npm run test:e2e
```

Install a Playwright browser first with `npx playwright install chromium`. On Windows you can use Microsoft Edge by setting `PLAYWRIGHT_CHANNEL=msedge`.

Add meaningful tests when changing timer behavior, storage recovery, trash or session accounting. Reject invalid imports as a whole; never silently truncate user records. Preserve originals before migration/replacement. See [STORAGE.md](STORAGE.md). For visual changes, check a narrow phone viewport, keyboard focus, both languages, and reduced-motion preferences. Report native acceptance separately from browser checks.

Please preserve the project's privacy: no analytics, advertising, remote fonts, account requirements, or task-data uploads. New features should help someone focus or take a break without adding noise.

The build generates asset fingerprints and the offline-cache version automatically. Preserve Electron sandbox, context isolation and the fixed IPC boundary. Keep each change small; no mandatory cloud services or dependency additions without a concrete need. Repository pushes, deployment and releases require separate owner authorization.

Contributions are licensed under the project's MIT license.
