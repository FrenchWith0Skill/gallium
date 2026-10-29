# Contributing to Gallium

Thanks for wanting to help! All contributions are released under the project's license (GPL-3.0).

## Reporting a bug

Open an *issue* and include:

- your Windows version and your Gallium version (Settings → About);
- what you did, what you expected and what happened;
- if possible, Gallium's PDF or HTML report (Report page) and a screenshot.

## Fixing or adding a translation

Each language is a `locales/<code>.json` file that maps the source text (written in French in the code) to its translation.

- **Fix a translation**: edit the value in your language's file, keeping the placeholders `{0}`, `{1}`… unchanged.
- **Add a language**: create `locales/<code>.json` from the texts in `locales/_source.json`, then add the language to
  the `LANGS` list in `renderer/app.js`.
- Check your work with:

  ```bash
  node tools/i18n/check.js
  ```

## Adding a processor or a graphics card

The database lives in `lib/hwdb.js`: add a line to `CPU_DATA` (`key gaming_score cinebench_r23_multi threads`) or to
`GPU_DATA` (`key=performance`, where RTX 5090 = 100), and the VRAM to `GPU_VRAM_DATA`. Please mention your source
(review, benchmark) in the pull request, then run:

```bash
npm test
```

## Changing the code

1. Fork the repository and create one branch per topic.
2. User-facing text is written in French inside `t('…')` (it is the translation source); then run
   `node tools/i18n/extract.js` and add the new entries to the language files.
3. Run `npm test` and try the app (`npm start`) before opening the pull request.

Technical documentation is in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
