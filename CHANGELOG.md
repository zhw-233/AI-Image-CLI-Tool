# 更新日志

## v1.0.0 - 2026-06-05

- 保留 v1 文生图、v2 图片编辑、v4 聊天端点探测。
- 移除 v3 provider guard、`--force`、冷却状态文件和相关说明。
- 抽出公共环境与请求工具，合并重复逻辑。
- 统一项目版本号为 1.0.0。

## v0.4.0 - 2026-06-04

- 为 v1 文生图新增 `--prompt-file <path>`。
- 为 v2 图片编辑新增 `--prompt-file <path>`。

## v0.3.0 - 2026-06-04

- 新增 v3 provider guard。
- 在真实图片请求前新增 `GET /v1/models` 预检。
- 新增 `--force` 和 `--no-preflight`。

## v0.2.0 - 2026-06-03

- 新增基于 `/v1/images/edits` 的 v2 图片编辑能力。
- 支持多输入图片和可选 mask。

## v0.1.0 - 2026-06-03

- 新增基于 `/v1/images/generations` 的 v1 文生图能力。
- 新增 `.env` 和 `.env.active` 加载逻辑。
