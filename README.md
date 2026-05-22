# AI Folder Organizer

AI Folder Organizer 是一个 Tauri 桌面工具，用来安全地整理本地文件夹：选择目录，交给 Anthropic 模型分析，审阅整理方案后再执行移动、重命名和新建目录操作，并支持撤销。

## 功能

- 选择本地目录并扫描文件树，默认最多扫描 5 层
- 使用 Anthropic API 生成结构化整理计划
- 在执行前预览每一步操作，包括 `mkdir`、`move`、`rename`
- 执行整理时保存 `.ai-organizer-undo.json` 撤销清单
- 一键撤销上一次整理，撤销完成后自动删除清单
- 路径安全校验：拒绝绝对路径、`..`、`~` 和目录外路径
- 支持明暗主题和本地设置保存

## 使用方式

1. 启动应用后点击左上角目录按钮，选择要整理的文件夹。
2. 打开 `API Key` 设置，填写 Anthropic API Key，并选择模型。
3. 点击底部 `分析`，等待 AI 生成整理计划。
4. 在右侧逐条检查整理方案。
5. 点击 `执行整理`。
6. 如需恢复，点击 `撤销`。

建议先在临时目录或备份目录中测试整理结果。

## 开发

```bash
npm install
npm run dev
```

也可以直接使用 Tauri 子命令：

```bash
npm run tauri dev
```

## 构建

```bash
npm run build
```

构建产物会出现在 `src-tauri/target/release/bundle/`。

## 测试

```bash
cd src-tauri
cargo test
```

当前测试覆盖了 AI 文件操作计划的路径安全边界。

## GitHub Actions 打包

仓库包含 `.github/workflows/release.yml`，支持：

- `workflow_dispatch` 手动触发打包
- 推送 `v*` tag 后自动多平台打包
- tag 构建完成后自动创建 GitHub Release 并上传产物

发布新版本示例：

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 系统要求

- Node.js 20+
- Rust stable
- macOS: Xcode Command Line Tools
- Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`
- Windows: Visual Studio C++ Build Tools

## 配置文件

设置保存在：

```text
~/.config/ai-folder-organizer/settings.json
```

字段包括 `api_key`、`last_dir` 和 `model`。

## 许可证

MIT
