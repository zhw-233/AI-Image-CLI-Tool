# gpt-image-2 示例项目

这是一个很小的 Node.js CLI，用来调用 OpenAI-compatible 的图片接口。

当前包含两项主要能力：

- 文本生成图片
- 基于图片继续编辑

## 环境要求

- Node.js 20 或更新版本
- OpenAI 或第三方 OpenAI-compatible API key

## 基础配置

```bash
cp .env.example .env
```

然后编辑 `.env`：

```bash
OPENAI_API_KEY=sk-your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_IMAGE_MODEL=gpt-image-2
```

## 生成图片

```bash
npm run generate -- "A clean product photo of a ceramic tea cup on a walnut desk"
```

支持 `--prompt-file`：

```bash
npm run generate -- --prompt-file prompts/example.txt
```

## 编辑图片

```bash
npm run edit -- --image outputs/base.png "Change the background to pale blue"
```

也可以使用 `--mask` 和多个 `--image` 输入。

## 参数说明

`--image <path>` 用在图片编辑命令里，表示要上传给模型参考或修改的原图。至少需要提供一个 `--image`，也可以重复多次传入多张参考图：

```bash
npm run edit -- --image outputs/base.png --image outputs/reference.png "Keep the main object and use the reference style"
```

`--mask <path>` 用在图片编辑命令里，表示只允许修改 mask 标记的区域。mask 通常是一张和原图尺寸一致的图片，具体透明区域、黑白区域如何解释取决于你使用的服务商接口实现。

```bash
npm run edit -- --image outputs/base.png --mask masks/background.png "Replace the background with a sunny kitchen"
```

`--format <format>` 用来指定保存结果的图片格式，常见值是 `png`、`jpeg`、`webp`。它可以用于生成图片和编辑图片：

```bash
npm run generate -- --format webp "A minimal product photo on a white table"
npm run edit -- --image outputs/base.png --format png "Make the background transparent"
```

## 切换 API 服务商

项目支持通过 `providers.json` 管理多个 OpenAI-compatible API 服务商。先复制示例配置：

```bash
cp providers.example.json providers.json
```

然后编辑 `providers.json`，为每个服务商填写 `baseUrl`、`model`、`apiKeyEnv` 等信息。示例里的 `third-party` 可以改成你自己的服务商名称。

查看可用服务商：

```bash
npm run providers
```

切换到某个服务商：

```bash
npm run provider:use -- third-party
```

查看当前激活的服务商配置：

```bash
npm run provider:current
```

切换命令会生成 `.env.active`。运行生成或编辑命令时，项目会先读取 `.env`，再读取 `.env.active`，所以你可以保留一份基础配置，再用 provider 切换命令覆盖当前服务商、模型和鉴权方式。

## 诊断

```bash
npm run doctor
npm run models
```

## 常用参数

`generate` 支持：

- `--base-url <url>`
- `--api-url <url>`
- `--prompt-file <path>`
- `--model <name>`
- `--size <size>`
- `--quality <quality>`
- `--background <value>`
- `--format <format>`
- `--output-dir <path>`
- `--dry-run`

`edit` 额外支持：

- `--image <path>`
- `--mask <path>`

## 输出

生成结果默认保存在 `outputs/`。
