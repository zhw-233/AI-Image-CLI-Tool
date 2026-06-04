# 贡献说明

感谢你帮助改进这个小型教学项目。

## 本地检查

这个项目没有额外 npm 依赖，使用 Node.js 20 或更新版本即可。

```bash
npm run check
```

如果本机没有 `npm`，也可以直接使用 `node --check`：

```bash
node --check src/generate.js
node --check src/edit.js
node --check src/provider-guard.js
node --check src/switch-provider.js
node --check src/doctor.js
node --check src/list-models.js
```

## 安全测试

在发送真实图片请求前，建议先使用 `--dry-run`：

```bash
node src/generate.js --dry-run "A simple red apple on a white background"
```

如果你还不确定服务商是否稳定，或者不希望立即消耗额度，请不要直接执行真实的生成或编辑请求。

## 密钥与敏感信息

不要提交真实 API key、服务商密钥、`.env`、`.env.active`、`providers.json`、`.provider-guard.json` 或已经生成的图片文件。
