# Security

## API Keys

Do not commit real API keys or provider credentials.

The following local files are intentionally ignored:

- `.env`
- `.env.active`
- `providers.json`
- `.provider-guard.json`
- generated files in `outputs/`

If a key is accidentally committed or shared, revoke it from the provider dashboard immediately and create a new key.

## Third-Party Providers

OpenAI-compatible third-party providers may behave differently from the official OpenAI API. Some providers may charge for a request even when the final client response is a timeout such as `524`.

The v3 provider guard reduces repeated risky requests, but it cannot guarantee that a request already sent to a provider will not be charged.
