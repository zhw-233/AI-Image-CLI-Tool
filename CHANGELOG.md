# Changelog

All notable changes to this project will be documented in this file.

## v0.3.0 - 2026-06-04

- Added v3 provider guard for safer use with unstable third-party providers.
- Added a preflight `GET /v1/models` check before paid image generation and edit requests.
- Added cooldown protection after `524` and other `5xx` provider failures.
- Added `--force` and `--no-preflight` command-line options.
- Added `v3:generate` and `v3:edit` npm scripts.
- Kept v1 text-to-image and v2 image-edit workflows.

## v0.2.0 - 2026-06-03

- Added v2 image editing through `/v1/images/edits`.
- Added support for one or more input images.
- Added optional mask support.
- Added provider request id logging when available.
- Removed local timeout from image requests.

## v0.1.0 - 2026-06-03

- Added v1 text-to-image generation through `/v1/images/generations`.
- Added `.env` and `.env.active` loading.
- Added third-party OpenAI-compatible provider support.
- Added provider switching, diagnostics, model listing, and dry-run support.
