# Contributing

Thanks for helping improve this small learning project.

## Local Checks

This project has no npm dependencies. Use Node.js 20 or newer.

```bash
npm run check
```

If `npm` is unavailable, run the files directly with `node --check`:

```bash
node --check src/generate.js
node --check src/edit.js
node --check src/provider-guard.js
node --check src/switch-provider.js
node --check src/doctor.js
node --check src/list-models.js
```

## Safe Testing

Use `--dry-run` before making real image requests:

```bash
node src/generate.js --dry-run "A simple red apple on a white background"
```

Do not run real generation or edit requests unless you are prepared for the provider to charge API credits.

## Secrets

Never commit real API keys, provider secrets, `.env`, `.env.active`, `providers.json`, `.provider-guard.json`, or generated images.
