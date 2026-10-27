# focusbreak.

**One thing at a time. A little room to breathe.**

A calm focus timer with tasks, useful breaks, and a private little record of your progress. Free, open source, and built for everyday use.

[Читать по-русски](README.ru.md)

![Focus Break desktop interface](docs/desktop-v2-preview.png)

**Development status:** the existing app is being extended into an offline Windows and Android application. Windows packages can be built locally; native installation, upgrade and lifecycle acceptance is still pending. There is no verified APK yet. See [FEATURES.md](FEATURES.md) and [ROADMAP.md](ROADMAP.md) for the actual status.

## Why it exists

It is easy to spend an afternoon switching between tabs and forget to step away from the screen. Focus Break gives you somewhere quiet to choose one intention, work for a while, and take an actual break.

No account to create. No streak to protect. No subscription.

## What you get

- **A reliable focus timer:** 25-minute sessions, 5-minute breaks, and a longer break after four completed sessions. Every duration is adjustable.
- **Tasks and planning:** projects, tags, priorities, due dates, completion-based daily/weekday/weekly repeats, search, a day plan and daily notes.
- **Recoverable deletion:** a local trash with complete task snapshots, search, restore one/all, and quick undo. Completed-task cleanup keeps daily totals.
- **A little perspective:** daily totals, a seven-day chart, and the ten most recent sessions.
- **Space to focus:** a distraction-free view and keyboard controls.
- **Useful break ideas:** simple prompts to look away, change position, and step away from your computer, with links to the original guidance.
- **Local storage:** platform-specific storage, validated JSON import/export, checksums, a last good copy, and explicit recovery after corruption or an interrupted save.
- **Offline support:** after a successful first visit, the app shell is cached by a service worker.
- **Russian and English**, responsive layouts, visible keyboard focus, reduced-motion support, and screen-reader labels.

The shared interface uses JavaScript and Vite, the desktop shell uses Electron, and Android uses Capacitor. The core features need no accounts, backend, remote fonts, trackers, or external API.

## Run locally

Install [Node.js](https://nodejs.org/) 22 or newer. In the project folder:

```sh
npm ci
npm run build
npm start
```

For a fresh checkout, run `npm ci` and `npm run build` before `npm start`. `npm start` opens Electron; `npm run web` starts Vite development mode.

For a browser preview of the current build, run `npm run preview` and open **http://127.0.0.1:4173**. Rebuild after source changes. Browser storage is separate from desktop storage.

You can also serve the `dist/` directory with any static HTTP server. Opening `index.html` directly as a file will not work because the application uses JavaScript modules.

On Windows, `start-focus-break.cmd` starts a browser preview of the existing `dist/`. It does not launch Electron. Build Windows packages with `npm run build:windows`; output is in `release/`. These local candidates are unsigned and still require native acceptance. New Portable builds select a `Focus Break Data` directory next to the launcher; move the EXE and that folder together after quitting. Earlier candidates used the Windows profile. See [PORTABLE.md](PORTABLE.md) for migration and testing limits.

## How time and privacy work

The timer uses a real deadline rather than counting interval callbacks. Background-tab throttling does not extend a running session. Pausing stores the remaining time; reloading restores it. Completing a focus session records it once and prepares a **paused** break, so a sleeping device cannot manufacture hours of completed work.

Only finished focus sessions contribute to focus statistics. Skipping or resetting a session does not award time. Dates follow the device's local timezone. Clearing completed tasks preserves their daily completion total.

A closed or sleeping browser cannot reliably play the completion sound. When you return, the app checks the deadline and records the one session that finished. Browser sound restrictions may also prevent a chime until you interact with the page.

Windows stores data in Electron userData; Android uses Preferences; the browser uses origin-specific localStorage. Use **Insights → Export data** before changing device, site address or app version. Restore a backup from **Settings**. Backups include your trash and task text. The storage format and recovery steps are documented in [STORAGE.md](STORAGE.md).

Task, session and note collections are no longer silently truncated. The current document limit is 5 MB in UTF-8; an oversized import is rejected in full. Private browsing or clearing site data can remove browser records. Resetting working data retains recovery copies and explicitly warns that this is not a complete personal-data wipe. Backup management and final deletion from trash are still pending.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Start or pause the timer |
| 1 / 2 / 3 / 4 | Focus / Insights / Break ideas / Day planner |
| Escape | Leave the distraction-free view or close a dialog |

Shortcuts do not interrupt typing. A focused button retains its normal Space-key behavior.

## Check the project

```sh
npm ci
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

On Linux CI, use `npx playwright install --with-deps chromium`.

To test with an existing Microsoft Edge on Windows:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

There are 55 domain/storage tests and 24 browser scenarios, including trash recovery, data-location selection, folder transport, write denial, offline use, multiple tabs and WCAG AA checks. Four desktop-settings scenarios use a simulated preload bridge. Browser and file-adapter tests do not replace Electron or Android acceptance.

The GitHub **Checks** workflow is configured to build Vite before browser tests. Its current revision has not been run remotely; native package jobs are still pending.

## Packaging and publishing

The browser build in `dist/` can be served statically after `npm run build`. The offline shell and asset names are generated by the build; do not edit `dist/` manually. Native packaging uses Electron Builder. Android source sync uses `npm run android:sync`; the current `android:apk` command references a missing script, so it is not a working APK build instruction yet.

The old Pages workflow has not been reviewed for the native-app development stage. Do not treat it as a verified release pipeline. Repository pushes, deployments and public releases require separate owner authorization. No public native release is declared by the package version alone.

If you fork this project and use Sites hosting, remove the existing project identity in `.openai/hosting.json` before registering a new Site.

## Project map

```text
src/                  Shared UI, domain logic and platform adapter
shared/               State validation and storage journal
desktop/              Electron main process, preload and file storage
android/              Capacitor Android project, not a verified APK
dist/                 Generated Vite output and offline shell
scripts/              Build, icons, local preview and Android tooling
tests/                Domain, storage and file-adapter tests
e2e/                  Browser, offline, recovery and accessibility tests
.github/workflows/    Continuous checks and legacy Pages workflow
```

Build scripts generate the offline-cache version from the output. Keep source changes in `src/`, `shared/` and the platform directories.

## Contributing

Small improvements are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Some good first ideas: another translation, more keyboard testing, or a manual screen-reader review.

Break ideas draw on [OSHA's computer-work process guidance](https://www.osha.gov/etools/computer-workstations/work-process) and [monitor viewing guidance](https://www.osha.gov/etools/computer-workstations/components/monitors/). The timer durations are editable product defaults.

## License

The existing repository contains [MIT](LICENSE). The owner has requested explicit confirmation of the final license before the first public native release; this development work does not change the license file.
