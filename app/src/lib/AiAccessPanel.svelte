<script lang="ts">
  // The "AI access" sheet: hands the user a working MCP config with zero
  // typing. Register/Unregister writes Claude Desktop's file; every other
  // client takes the snippet below it. Spec §6 of the MCP design.
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { api, errMessage, type McpSetup } from "./api";
  import { accel } from "./keys";
  import Button from "./ui/Button.svelte";
  import InlineMessage from "./ui/InlineMessage.svelte";
  import Sheet from "./ui/Sheet.svelte";

  let { onClose }: { onClose: () => void } = $props();

  let info = $state<McpSetup | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let copied = $state(false);

  api
    .mcpSetupInfo()
    .then((i) => (info = i))
    .catch((e) => (error = errMessage(e)));

  async function setClaude(on: boolean) {
    busy = true;
    error = null;
    try {
      info = await api.mcpSetClaudeDesktop(on);
    } catch (e) {
      error = errMessage(e);
    } finally {
      busy = false;
    }
  }

  async function copy() {
    if (!info) return;
    await writeText(info.snippet).catch(() => {});
    copied = true;
  }
</script>

<Sheet title="AI 访问" width="min(560px, 92vw)" onclose={onClose} data-testid="ai-access-backdrop">
  <p>
    让 AI 助手通过本应用修改你的设置 —— 总览、探针阵型、窗口布局、快捷键、Neocom、HUD、
    舰队与聊天，以及复制设置与预设。每次修改都与在此编辑一样，经过相同的备份与检查。
    本应用打开期间，助手在你的窗口中操作：它的修改如同你亲手完成，每条都可撤销，
    按 {accel("Z")} 即可回退。
  </p>

  {#if info}
    {@const cd = info.claude_desktop}
    <h3>Claude Desktop</h3>
    {#if cd}
      <p class="row">
        <span>{cd.registered ? "已注册" : "未注册"}</span>
        <Button disabled={busy} onclick={() => void setClaude(!cd.registered)}>
          {cd.registered ? "取消注册" : "注册"}
        </Button>
      </p>
      <p class="meta">重启 Claude Desktop 使更改生效。</p>
    {:else}
      <p class="meta">Claude Desktop 未安装在本机 —— 在其他客户端中使用下方片段。</p>
    {/if}

    <h3>任何其他 MCP 客户端</h3>
    <pre>{info.snippet}</pre>
    <p class="row">
      <Button variant="ghost" onclick={() => void copy()}>复制</Button>
      {#if copied}<span class="meta">已复制</span>{/if}
    </p>
    <p class="meta">
      将其粘贴到客户端的 MCP 配置中。VS Code 使用 <code>servers</code> 键，Codex 使用
      <code>[mcp_servers.…]</code> TOML 表 —— 命令与参数相同。
    </p>
  {/if}

  {#if error}<InlineMessage variant="error">{error}</InlineMessage>{/if}

  {#snippet footer()}
    <Button onclick={onClose}>关闭</Button>
  {/snippet}
</Sheet>

<style>
  h3 {
    margin: var(--s3) 0 var(--s1);
    font-size: var(--t-ui);
    font-weight: 600;
  }
  pre {
    overflow-x: auto;
    padding: var(--s2);
    background: var(--surface-raised);
    border-radius: var(--r-sm);
    font-size: var(--t-caption);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--s3);
  }
  .meta {
    color: var(--text-muted);
    font-size: var(--t-caption);
    margin: var(--s1) 0 0;
  }
</style>
