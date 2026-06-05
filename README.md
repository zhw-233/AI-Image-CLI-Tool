# Image-CLI-Tool

这是一个很小的 Node.js CLI 工具，用来通过图片 API 生成和编辑图片。

当前包含两项主要能力：

- 文本生成图片
- 基于图片继续编辑

## 环境要求

- Node.js 20 或更新版本
- 图片 API 服务商的 API key

## 基础配置

```bash
cp .env.example .env
```

然后编辑 `.env`：

```bash
IMAGE_API_KEY=your-api-key
IMAGE_API_BASE_URL=https://your-image-api.example.com/v1
IMAGE_API_MODEL=your-image-model
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

下面这些参数在命令里都要放在 `--` 后面，例如：

```bash
npm run generate -- --format webp "A minimal product photo on a white table"
npm run edit -- --image outputs/base.png --format png "Make the background transparent"
```

通用参数，也就是 `generate` 和 `edit` 都支持：

- `--base-url <url>`：设置图片 API 的基础地址，例如 `https://your-image-api.example.com/v1`。它会覆盖 `.env` 里的 `IMAGE_API_BASE_URL`。
- `--api-url <url>`：直接指定完整接口地址。生成图片时对应图片生成接口，编辑图片时对应图片编辑接口；它的优先级高于 `--base-url`。
- `--prompt-file <path>`：从 UTF-8 文本文件读取 prompt，适合较长或多行提示词。使用它时不要再额外传入行内 prompt。
- `--model <name>`：指定模型名称，例如你的服务商提供的图片模型名。它会覆盖 `.env` 里的 `IMAGE_API_MODEL`。
- `--size <size>`：指定图片尺寸，例如 `1024x1024`、`1024x1536`、`1536x1024`。是否支持取决于模型和服务商。
- `--quality <quality>`：指定图片质量，例如 `auto`、`low`、`medium`、`high`。如果保持 `auto`，请求里不会显式发送这个字段。
- `--background <value>`：指定背景选项，例如 `auto`、`transparent`、`opaque`。如果保持 `auto`，请求里不会显式发送这个字段。
- `--format <format>`：指定保存结果的图片格式，常见值是 `png`、`jpeg`、`webp`。
- `--output-dir <path>`：指定图片输出目录，默认是 `outputs`。
- `--dry-run`：只打印即将发送的请求地址和参数，不调用 API，也不会生成图片。
- `--help`：显示当前命令支持的参数。

编辑图片专用参数：

- `--image <path>`：上传给模型参考或修改的原图。编辑命令至少需要一个 `--image`，也可以重复多次传入多张参考图。
- `--mask <path>`：指定局部编辑用的 mask 图片，表示只允许修改 mask 标记的区域。mask 通常是一张和原图尺寸一致的图片，具体透明区域、黑白区域如何解释取决于服务商接口实现。

多图参考示例：

```bash
npm run edit -- --image outputs/base.png --image outputs/reference.png "Keep the main object and use the reference style"
```

局部编辑示例：

```bash
npm run edit -- --image outputs/base.png --mask masks/background.png "Replace the background with a sunny kitchen"
```

## 切换 API 服务商

项目支持通过 `providers.json` 管理多个图片 API 服务商。先复制示例配置：

```bash
cp providers.example.json providers.json
```

然后编辑 `providers.json`，为每个服务商填写 `baseUrl`、`model`、`apiKeyEnv` 等信息。示例里的 `third-party` 可以改成你自己的服务商名称。

`apiKeyEnv` 填的是“环境变量名”，不是 API key 本身。这样可以把密钥继续放在 `.env` 里，而不是写进 `providers.json`。

例如你的 `.env` 里这样写：

```bash
IMAGE_API_KEY=provider-a-key
PROVIDER_B_API_KEY=provider-b-key
```

那么 `providers.json` 可以这样对应：

```json
{
  "providers": {
    "provider-a": {
      "name": "Provider A",
      "baseUrl": "https://provider-a.example.com/v1",
      "model": "provider-a-image-model",
      "apiKeyEnv": "IMAGE_API_KEY",
      "authHeader": "Authorization",
      "authScheme": "Bearer"
    },
    "provider-b": {
      "name": "Provider B",
      "baseUrl": "https://provider-b.example.com/v1",
      "model": "provider-b-image-model",
      "apiKeyEnv": "PROVIDER_B_API_KEY",
      "authHeader": "Authorization",
      "authScheme": "Bearer"
    }
  }
}
```

切换到 `provider-b` 后，脚本会从 `.env` 里的 `PROVIDER_B_API_KEY` 读取密钥。也就是说：

- `.env` 负责保存真实密钥，例如 `PROVIDER_B_API_KEY=...`
- `providers.json` 负责告诉项目“这个服务商应该读取哪个变量”，例如 `"apiKeyEnv": "PROVIDER_B_API_KEY"`
- 不建议把真实 key 直接写进 `providers.json`

如果服务商不是 `Authorization: Bearer <key>` 这种鉴权方式，可以在对应 provider 里调整：

```json
{
  "authHeader": "x-api-key",
  "authScheme": ""
}
```

如果服务商需要额外请求头，可以加入 `extraHeaders`：

```json
{
  "extraHeaders": {
    "X-Provider": "example"
  }
}
```

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

例如执行：

```bash
npm run provider:use -- provider-b
```

会生成类似这样的 `.env.active`：

```bash
IMAGE_PROVIDER=provider-b
IMAGE_API_BASE_URL=https://provider-b.example.com/v1
IMAGE_API_MODEL=provider-b-image-model
IMAGE_API_KEY_ENV=PROVIDER_B_API_KEY
IMAGE_API_AUTH_HEADER=Authorization
IMAGE_API_AUTH_SCHEME=Bearer
```

此时真实密钥仍然来自 `.env` 里的 `PROVIDER_B_API_KEY`。

## 诊断

```bash
npm run doctor
npm run models
```

## 输出

生成结果默认保存在 `outputs/`。
