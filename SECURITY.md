# 安全说明

## API Key

不要提交真实 API key 或服务商凭证。

下面这些本地文件会被有意忽略：

- `.env`
- `.env.active`
- `providers.json`
- `.provider-guard.json`
- `outputs/` 目录中的生成图片

如果 key 被误提交或泄露，请立刻去服务商后台撤销旧 key，并重新创建新的 key。

## 第三方服务商

第三方 OpenAI-compatible 服务商的行为可能和官方 OpenAI API 不完全一致。有些服务商即使最终客户端收到的是 `524` 这类超时错误，也可能已经对该请求计费。

v3 的 provider guard 可以减少连续重复发送高风险请求，但它不能保证“已经发送到服务商的那一次请求”一定不会被计费。
