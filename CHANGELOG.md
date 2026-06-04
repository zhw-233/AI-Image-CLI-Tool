# 更新日志

这个文件用于记录项目的重要变更。

## v0.4.0 - 2026-06-04

- 为 v1 文生图新增 `--prompt-file <path>`，支持从文本文件读取长 prompt。
- 为 v2 图片编辑新增 `--prompt-file <path>`，支持从文本文件读取长 prompt。
- 新增 `prompts/example.txt`，作为结构化长 prompt 的示例模板。

## v0.3.0 - 2026-06-04

- 新增 v3 provider guard，用于在第三方服务商不稳定时降低误请求和连续扣费风险。
- 在真实图片生成和编辑请求前，新增 `GET /v1/models` 预检。
- 当服务商返回 `524` 或其他 `5xx` 错误时，新增冷却保护机制。
- 新增 `--force` 和 `--no-preflight` 命令行参数。
- 新增 `v3:generate` 和 `v3:edit` npm 脚本。
- 保留 v1 文生图和 v2 图片编辑工作流。

## v0.2.0 - 2026-06-03

- 新增基于 `/v1/images/edits` 的 v2 图片编辑能力。
- 支持上传一张或多张输入图片。
- 新增可选 mask 支持。
- 在服务商提供时，新增 request id 日志输出。
- 移除本地主动超时，避免生成时间较长时提前中断。

## v0.1.0 - 2026-06-03

- 新增基于 `/v1/images/generations` 的 v1 文生图能力。
- 新增 `.env` 和 `.env.active` 加载逻辑。
- 新增第三方 OpenAI-compatible provider 支持。
- 新增 provider 切换、配置诊断、模型列表和 dry-run 支持。
