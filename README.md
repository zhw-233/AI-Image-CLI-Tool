# gpt-image-2 示例项目

这是一个很小的 Node.js 命令行项目，用来调用 OpenAI-compatible 的图片生成接口。

项目默认使用 `gpt-image-2`，方便你测试这个模型。如果你的第三方服务商不支持这个模型，可以在 `.env` 或 `providers.json` 里改成服务商提供的其他图片模型名称。

当前项目分成三个版本：

- v1：文本生成图片，也就是 text-to-image
- v2：基于上一张图片继续修改，也就是 image edit / image-to-image
- v3：保留 v1 和 v2，并加入 provider guard，用来减少第三方服务商不稳定时的误请求和连续扣费风险

## 环境要求

- Node.js 20 或更新版本
- OpenAI 或第三方 OpenAI-compatible API key

这个项目没有额外 npm 依赖。

## 基础配置

先复制环境变量示例：

```bash
cp .env.example .env
```

然后编辑 `.env`：

```bash
OPENAI_API_KEY=sk-your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_IMAGE_MODEL=gpt-image-2
```

## 使用第三方 API

如果你的模型由第三方 OpenAI-compatible API 提供，把 `.env` 改成类似这样：

```bash
OPENAI_API_KEY=your-provider-key
OPENAI_BASE_URL=https://your-provider.example.com/v1
OPENAI_IMAGE_MODEL=gpt-image-2
```

如果你想把第三方 key 放在另一个变量里，可以这样配置：

```bash
THIRD_PARTY_API_KEY=your-provider-key
OPENAI_API_KEY_ENV=THIRD_PARTY_API_KEY
OPENAI_BASE_URL=https://your-provider.example.com/v1
```

大多数兼容接口使用 `Authorization: Bearer <key>`。如果你的服务商不是这种格式，可以修改：

```bash
OPENAI_AUTH_HEADER=x-api-key
OPENAI_AUTH_SCHEME=
```

如果服务商需要额外请求头，`OPENAI_EXTRA_HEADERS` 必须是合法 JSON，并且属性名要用双引号：

```bash
OPENAI_EXTRA_HEADERS={"X-Provider":"example"}
```

如果不需要额外请求头，请保持为空：

```bash
OPENAI_EXTRA_HEADERS=
```

## 像 ccswitch 一样切换 provider

先创建本地 provider 配置：

```bash
cp providers.example.json providers.json
```

编辑 `providers.json`，填入你的第三方 API 地址、模型名和 key 变量名。

查看、切换和确认当前 provider：

```bash
npm run providers
npm run provider:use -- third-party
npm run provider:current
```

如果你的电脑没有 `npm`，但有 `node`，也可以直接运行：

```bash
node src/switch-provider.js list
node src/switch-provider.js use third-party
node src/switch-provider.js current
```

切换命令会生成 `.env.active`。生成图片时，脚本会先读取 `.env`，再读取 `.env.active`，这样你可以切换 provider，而不用反复手改主 `.env` 文件。

## 生成图片

这是 v1 功能：只用文本 prompt 生成一张新图片。当前默认命令已经带有 v3 provider guard。

```bash
npm run generate -- "A clean product photo of a ceramic tea cup on a walnut desk"
```

如果没有 `npm`，但有 `node`：

```bash
node src/generate.js "A clean product photo of a ceramic tea cup on a walnut desk"
```

图片会保存到 `outputs/` 目录。

你也可以显式使用 v1 命令：

```bash
npm run v1:generate -- "A simple red apple on a white background"
```

或者显式使用 v3 命令：

```bash
npm run v3:generate -- "A simple red apple on a white background"
```

如果你的 prompt 很长，建议放到文本文件里：

```bash
node src/generate.js --prompt-file prompts/example.txt
```

你也可以自己创建一个文件，比如：

```text
prompts/beauty-studio.txt
```

然后运行：

```bash
node src/generate.js --prompt-file prompts/beauty-studio.txt
```

运行时会实时输出当前执行步骤，例如：

```text
[1] Loading environment files - .env, .env.active (0.0s)
[2] Parsing command line arguments (0.0s)
[3] Prepared request - model=gpt-image-2, url=https://.../v1/images/generations (0.0s)
[4] Resolving API key (0.0s)
[5] Running provider preflight - GET https://.../v1/models (0.0s)
[6] Received provider preflight response - status=200 (0.8s)
[7] Provider preflight passed - model gpt-image-2 is listed (0.8s)
[8] Sending image generation request - no local timeout (0.8s)
[9] Received API response headers - status=200 (3.2s)
[10] Provider request id - req_xxx (3.2s)
[11] Reading response body (3.2s)
[12] Parsing response body - 12345 bytes (3.3s)
[13] Reading image data from response (3.3s)
[14] Saving image file - outputDir=outputs (3.3s)
[15] Done - outputs/...png (3.3s)
```

如果服务商后台能看到 request id，可以用它证明这次请求确实到达了服务商。注意：request id 通常用于后台日志、扣费记录或客服排查，并不一定能直接用来取回图片；是否能查询结果，要看服务商有没有提供额外的任务查询接口。

## 先 dry-run 检查请求

dry-run 不会真正调用 API，也不会消耗额度，只会打印即将发送的请求地址和参数：

```bash
npm run dry-run
```

或者使用你自己的提示词：

```bash
npm run generate -- --dry-run "A small glass greenhouse on a rainy morning"
```

切换 provider 后，建议先 dry-run 一次，确认请求 URL 是否正确。

## 长 prompt 的推荐写法

长提示词最好不要直接塞进一行终端命令里。更稳的做法是写进 UTF-8 文本文件，再用 `--prompt-file` 读取。

项目里已经带了一个示例：

```text
prompts/example.txt
```

可以直接测试：

```bash
node src/generate.js --dry-run --prompt-file prompts/example.txt
```

文件里的 prompt 可以写成结构化形式，例如：

```text
主体：
一位成年办公室职员，半身肖像

场景：
明亮现代办公室，办公桌、电脑、绿植

光线：
柔和自然光

风格：
真实摄影风格，画面干净专业
```

脚本会保留中间的换行内容，只去掉文件开头和结尾多余空白。

## v3：provider guard 防止连续踩坑

v3 保留 v1 文生图和 v2 图片编辑，同时增加 provider guard。它的目标是减少第三方服务商返回 `524`、`502`、`503`、`504` 等错误时，你继续反复发送真实图片请求导致连续扣费。

provider guard 默认开启，会做两件事：

- 请求前先调用 `GET /v1/models` 做轻量预检。如果服务商连 `/models` 都失败、超时或返回 5xx，就不会发送真正的图片生成或编辑请求。
- 如果真实图片请求返回 `5xx` 或 `524`，会把这个 provider 和模型记录到 `.provider-guard.json`，默认保护 30 分钟。保护期内再次运行会直接拦截，不会发送图片请求。

注意：provider guard 只能阻止“下一次”和“预检失败时”的请求。只要真实 `/v1/images/generations` 或 `/v1/images/edits` 已经发给服务商，那一次仍然可能被服务商计费，即使最后返回 `524`。

常用命令：

```bash
npm run v3:generate -- "A clean product photo of a ceramic tea cup on a walnut desk"
npm run v3:edit -- --image outputs/base.png "Keep the apple, change the background to pale blue"
```

如果服务商没有实现 `/models`，但图片接口可用，可以跳过预检：

```bash
node src/generate.js --no-preflight "A simple red apple on a white background"
```

如果保护期内你仍然确定要发送请求，可以强制覆盖：

```bash
node src/generate.js --force "A simple red apple on a white background"
```

可以在 `.env` 中调整 provider guard：

```bash
PROVIDER_GUARD=on
PROVIDER_PREFLIGHT=on
PROVIDER_PREFLIGHT_TIMEOUT_MS=10000
PROVIDER_COOLDOWN_SECONDS=1800
PROVIDER_GUARD_STATE=.provider-guard.json
```

如果临时完全关闭保护：

```bash
PROVIDER_GUARD=off
```

## v2：基于上一张图片继续修改

这是 v2 功能：把上一张图片作为输入，再用新的 prompt 描述你想改哪里。当前默认编辑命令也带有 v3 provider guard。

基本命令：

```bash
node src/edit.js --image outputs/base.png "Keep the apple, change the background to pale blue"
```

如果使用 npm：

```bash
npm run edit -- --image outputs/base.png "Keep the apple, change the background to pale blue"
```

或者显式使用 v2 命令：

```bash
npm run v2:edit -- --image outputs/base.png "Keep the apple, change the background to pale blue"
```

或者显式使用 v3 命令：

```bash
npm run v3:edit -- --image outputs/base.png "Keep the apple, change the background to pale blue"
```

如果编辑 prompt 很长，也可以放到文件里：

```bash
node src/edit.js --image outputs/base.png --prompt-file prompts/example.txt
```

v2 的迭代流程是：

```text
文本 prompt -> v1 生成图片 A
图片 A + 修改 prompt -> v2 生成图片 B
图片 B + 修改 prompt -> v2 生成图片 C
```

例如：

```bash
node src/generate.js "A red apple on a white background"
node src/edit.js --image outputs/第一张图片.png "Keep the apple, make the background light blue"
node src/edit.js --image outputs/第二张图片.png "Keep the same apple, add soft shadow under it"
```

如果服务商支持 mask，可以只修改局部区域：

```bash
node src/edit.js \
  --image outputs/base.png \
  --mask masks/background-mask.png \
  "Replace only the masked background with a sunny kitchen"
```

注意：`/v1/images/edits` 是否支持，要看你的第三方服务商。如果服务商没有实现图片编辑接口，v2 会返回接口错误；这时 v1 仍然可以继续使用。

## 诊断当前配置

如果请求失败，可以先运行：

```bash
npm run doctor
```

如果没有 `npm`：

```bash
node src/doctor.js
```

这个命令会打印当前使用的 provider、base URL、模型、key 来源和鉴权方式。API key 会被打码，不会完整显示。

也可以查看第三方服务实际暴露了哪些模型：

```bash
npm run models
```

没有 `npm` 时：

```bash
node src/list-models.js
```

## 测试聊天端点

有些第三方服务商的模型页面只写了 `/v1/chat/completions`，不一定支持 `/v1/images/generations` 或 `/v1/images/edits`。这时可以用探测脚本看聊天端点到底返回什么格式：

```bash
npm run chat:probe -- --prompt-file prompts/2.txt
```

如果没有 `npm`：

```bash
node src/chat-completions-probe.js --prompt-file prompts/2.txt
```

这个脚本会真实请求：

```text
POST /v1/chat/completions
```

它会打印状态码、request id、响应正文摘要，并尝试识别返回内容里有没有图片 URL 或 base64 图片。如果响应里发现 base64 图片，可以加 `--save-images` 保存候选图片：

```bash
node src/chat-completions-probe.js --prompt-file prompts/2.txt --save-images
```

注意：这是一次真实外部请求，可能消耗服务商额度。它只是用于判断服务商的聊天端点是否能返回图片相关结果，不会改变 v1/v2/v3 的图片接口实现。

## 常用参数

```bash
npm run generate -- \
  --model gpt-image-2 \
  --size 1024x1024 \
  --quality high \
  --format png \
  "A minimal poster for a jazz night, black ink and warm red paper"
```

可用参数：

- `--base-url <url>`：OpenAI-compatible API 的基础地址
- `--api-url <url>`：完整的图片生成接口地址，会覆盖 `--base-url`
- `--prompt-file <path>`：从 UTF-8 文本文件读取 prompt
- `--model <name>`：模型名
- `--size <size>`：图片尺寸，例如 `1024x1024`
- `--quality <quality>`：质量，例如 `auto`、`low`、`medium`、`high`
- `--background <value>`：背景，例如 `auto`、`transparent`、`opaque`
- `--format <format>`：输出格式，例如 `png`、`jpeg`、`webp`
- `--output-dir <path>`：输出目录，默认是 `outputs`
- `--dry-run`：只打印请求，不调用 API
- `--no-preflight`：跳过 v3 的 `GET /models` 请求前检查
- `--force`：忽略 v3 保护状态并直接发送请求

## 说明

脚本会向 `/v1/images/generations` 发送 `POST` 请求，并把返回结果里的第一个 `b64_json` 图片保存到本地。

如果返回：

```text
OpenAI API request failed (503): No available compatible accounts
```

通常表示第三方服务商当前没有可用的上游账号、额度或兼容通道来处理这个模型。此时本地配置可能已经正确，需要换服务商、换模型，或等服务商恢复可用账号。

如果服务商已经扣费，但本地没有收到图片，常见原因是：服务商已经接受请求并开始生成，所以计费发生了；但本地连接在图片返回前中断了。图片生成可能需要 30 到 600 秒，建议不要短时间内重复重试同一个 prompt。

```bash
node src/generate.js "A simple red apple on a white background"
```
