# Contributing

Thanks for helping make this little tool useful.

Open an issue describing the behavior you want to change, or send a small pull request. Include a concrete before/after example for bug fixes.

## Development

Use Node.js 22 or newer. Run `npm ci`, then `npm start`. The application is served directly from `dist/`; there is no build step.

Keep application logic in `dist/core.js` independent of the DOM. Keep UI strings in `dist/i18n.js`, in both languages. Treat user task text as text: use `textContent`, never HTML interpolation.

Before submitting:

```sh
npm run check
npm test
npm run test:e2e
```

Install a Playwright browser first with `npx playwright install chromium`. On Windows you can use Microsoft Edge by setting `PLAYWRIGHT_CHANNEL=msedge`.

Add tests when changing timer behavior, storage recovery, or session accounting. For visual changes, check a narrow phone viewport, keyboard focus, both languages, and reduced-motion preferences.

Please preserve the project's privacy: no analytics, advertising, remote fonts, account requirements, or task-data uploads. New features should help someone focus or take a break without adding noise.

When changing app assets, update the cache name in `dist/sw.js`.

Contributions are licensed under the project's MIT license.
