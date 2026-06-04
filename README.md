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
