# focusbreak.

**One thing at a time. A little room to breathe.**

A calm focus timer with tasks, useful breaks, and a private little record of your progress. Free, open source, and built for everyday use.

[Читать по-русски](README.ru.md)

![Focus Break desktop interface](docs/desktop.png)

## Why it exists

It is easy to spend an afternoon switching between tabs and forget to step away from the screen. Focus Break gives you somewhere quiet to choose one intention, work for a while, and take an actual break.

No account to create. No streak to protect. No subscription.

## What you get

- **A reliable focus timer:** 25-minute sessions, 5-minute breaks, and a longer break after four completed sessions. Every duration is adjustable.
- **Your intentions for today:** add tasks, pick one to focus on, check it off, and clear completed tasks.
- **A little perspective:** daily totals, a seven-day chart, and the ten most recent sessions.
- **Space to focus:** a distraction-free view and keyboard controls.
- **Useful break ideas:** simple prompts to look away, change position, and step away from your computer, with links to the original guidance.
- **Your data, yours:** local browser storage, JSON backups, restore, and deletion.
- **Offline support:** after a successful first visit, the app shell is cached by a service worker.
- **Russian and English**, responsive layouts, visible keyboard focus, reduced-motion support, and screen-reader labels.

There are **no runtime dependencies**, external fonts, trackers, or remote data services. Test tools are development dependencies only.

## Run locally

Install [Node.js](https://nodejs.org/) 22 or newer. In the project folder:

```sh
npm start
```

Open **http://127.0.0.1:4173**. You do not need to install packages just to use the app.

You can also serve the `dist/` directory with any static HTTP server. Opening `index.html` directly as a file will not work because the application uses JavaScript modules.

On Windows, `start-focus-break.cmd` starts the local server.

## How time and privacy work

The timer uses a real deadline rather than counting interval callbacks. Background-tab throttling does not extend a running session. Pausing stores the remaining time; reloading restores it. Completing a focus session records it once and prepares a **paused** break, so a sleeping device cannot manufacture hours of completed work.

Only finished focus sessions contribute to focus statistics. Skipping or resetting a session does not award time. Dates follow the device's local timezone. Clearing completed tasks preserves their daily completion total.

A closed or sleeping browser cannot reliably play the completion sound. When you return, the app checks the deadline and records the one session that finished. Browser sound restrictions may also prevent a chime until you interact with the page.

All tasks, settings, and history live in `localStorage` under `focus-break:v1`. Data is specific to a browser and origin. Use **Insights → Export data** before changing device or site address. Restore a backup from **Settings**. Backups contain your task text, so keep them somewhere appropriate.

The app keeps up to 100 tasks, 2,000 completed focus sessions, and 2,000 task-completion records. Private-browsing settings and clearing site data can remove your records. The hosting provider still receives ordinary page requests; the application sends it no task or session data.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Start or pause the timer |
| 1 / 2 / 3 | Focus / Insights / Break ideas |
| Escape | Leave the distraction-free view or close a dialog |

Shortcuts do not interrupt typing. A focused button retains its normal Space-key behavior.

## Check the project

```sh
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

On Linux CI, use `npx playwright install --with-deps chromium`.

To test with an existing Microsoft Edge on Windows:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

There are 13 domain tests and 8 browser scenarios, covering pause/resume, sleep recovery, session accounting, data validation, backup restore, multiple tabs, offline use, mobile overflow, and automated WCAG AA checks. Automated checks do not replace a manual accessibility review.

The GitHub **Checks** workflow runs the same checks on pushes and pull requests.

## Publish

The app is completely static. Upload the contents of `dist/` to a static host with HTTPS. All asset paths are relative, so repository subpaths work as well.

For GitHub Pages:

1. Open the repository's **Settings → Pages** and select **GitHub Actions** as the source.
2. Open **Actions → Publish to GitHub Pages → Run workflow**.
3. Use the URL returned by the workflow. To publish changes later, run that workflow again.

No environment variables, API keys, database, or build step are needed.

If you fork this project and use Sites hosting, remove the existing project identity in `.openai/hosting.json` before registering a new Site.

## Project map

```text
dist/
  index.html           Accessible application shell
  styles.css           Responsive visual design
  app.js               Browser interactions and persistence
  core.js              Timer state and statistics
  i18n.js              Russian and English strings
  sw.js                Offline app-shell cache
scripts/serve.mjs      Local HTTP server, no dependencies
tests/core.test.js     Domain behavior tests
e2e/app.spec.js        Browser and accessibility checks
.github/workflows/     Continuous checks and optional Pages publishing
```

When changing cached files, increment the cache name in `dist/sw.js` so old app-shell caches are cleaned up.

## Contributing

Small improvements are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Some good first ideas: another translation, more keyboard testing, or a manual screen-reader review.

Break ideas draw on [OSHA's computer-work process guidance](https://www.osha.gov/etools/computer-workstations/work-process) and [monitor viewing guidance](https://www.osha.gov/etools/computer-workstations/components/monitors/). The timer durations are editable product defaults.

## License

[MIT](LICENSE). Make it your own. Build something useful.
