# EVE Settings Editor

[English](README.md) | [简体中文](README.zh-CN.md)

一个用于编辑本地 EVE Online 客户端设置的小型桌面应用 —— 即 EVE 按角色
（character）和按账号（account）存储的 `core_char_*.dat` / `core_user_*.dat`
文件。它以安全、可视化的方式完成游戏内 UI 繁琐的操作：摆放与调整窗口大小、
配置总览（overview）列、编辑记忆文本（自动补全）列表、为账号命名并将角色
关联到账号，以及把一个角色的整套配置复制到其他角色。

每次更改都经过**备份 → 校验 → 原子写入**链路：先备份文件，新字节在替换原始
文件前会被解码并校验，任何一步失败都不会留下写了一半的文件。可从任意备份
一键还原。

## 功能

- **布局（layout）编辑器** —— 在按比例缩放的屏幕模拟图上拖放、缩放窗口，
  也可直接输入精确几何参数。
- **总览列** —— 按总览标签页显示/隐藏、重排并调整列宽。
- **自动补全** —— 编辑或清除客户端自动补全的文本。
- **账号** —— 为账号设置易读的名称，并手动或通过引导式捕获将角色关联到账号。
- **复制设置** —— 将一个角色的布局 / 总览 / 自动补全 / 全部内容复制到其他
  角色，并预览每次复制将影响哪些文件（以及哪些其他角色）。也可将一个文件原样
  复制到同类的其他文件，无需配对账号。
- **原始树编辑器**（带搜索），用于处理其余一切数据。

## AI 访问

应用可通过 [Model Context Protocol](https://modelcontextprotocol.io) 由 AI 助手
操作：同一个可执行文件以 `--mcp` 启动后即成为一个 MCP 服务器，暴露全部编辑
器 —— 总览、探针（probe）阵型、窗口布局（含渲染图像）、自动补全、快捷键
（keybind）、Neocom、HUD、舰队与聊天 —— 以及复制设置和设置预设（preset）。每次
编辑与应用本身走同一条备份 → 校验 → 原子写入链路：文件内编辑仅在助手保存时
写入；复制设置与设置预设立即写入，并生成备份。

助手打开的每个账号都保留各自的会话工作区，因此它可以在不重新加载的情况下读取
和编辑你的全部角色。

应用打开时，助手在应用内工作：它的修改会立即出现在窗口中，每条修改都带一个
撤销操作，窗口自身的 Ctrl+Z 也可撤销它们。助手的 `undo` 只撤销它自己的
步骤。

从应用菜单打开 **AI access…**。若已安装 Claude Desktop，**Register** 会把
该服务器加入其配置（之后重启 Claude Desktop）。对于其他 MCP 客户端，把界面
显示的代码片段复制到客户端配置即可 —— 这是标准的 `mcpServers` 结构：

```json
{ "mcpServers": { "eve-settings-editor": { "command": "<path to the app>", "args": ["--mcp"] } } }
```

只在角色登出时编辑；EVE 客户端会在登出时重写其设置。

## 安装

从 [Releases](https://github.com/StormDelay/eve-settings-editor/releases) 页面
下载对应操作系统的安装包 —— Windows（`.msi` / `.exe`）、macOS（`.dmg`）或
Linux（`.AppImage` / `.deb` / `.rpm`）。

构建产物**未签名**，因此首次启动时操作系统会给出警告（Windows SmartScreen →
“更多信息” → “仍要运行”；macOS → 右键 → 打开）。这是预期行为。

## 范围与安全

本工具仅读写你已拥有的本地设置文件 —— 与玩家手动复制的文件相同。它从不
接触游戏客户端、你的账号凭据、网络流量或游戏内的任何内容。本工具与
CCP Games 无关联，也未获其认可。

## 从源码构建

需要 [Rust](https://rustup.rs) 和 [Node](https://nodejs.org)。在 `app/` 目录
下：先执行 `npm install`，然后 `npm run tauri dev` 运行，或
`npm run tauri build` 打包。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。

总览预览使用 FreeType 渲染文本，其依据 FreeType 许可证使用：本软件的部分内容
版权所有 © 2023 The FreeType Project（www.freetype.org）。保留所有权利。它读取
你安装目录中 EVE 自带的字体；编辑器不随附分发任何字体。
