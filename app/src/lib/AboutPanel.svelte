<script lang="ts">
  // The version comes from the runtime, which reads it out of tauri.conf.json —
  // NOT from a constant here. A hardcoded string is a second number to bump at
  // release, and the one that gets forgotten.
  import { getVersion } from "@tauri-apps/api/app";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import Button from "./ui/Button.svelte";
  import Sheet from "./ui/Sheet.svelte";

  let { onClose }: { onClose: () => void } = $props();

  const REPO = "https://github.com/StormDelay/eve-settings-editor";

  // Resolved once at mount, like Sidebar's own `refresh()`. Shown as "…" until
  // it lands rather than blank, so an empty box never reads as "no version".
  let version = $state("…");
  getVersion()
    .then((v) => (version = v))
    .catch(() => (version = "未知"));
</script>

<Sheet title="关于" width="min(420px, 92vw)" onclose={onClose} data-testid="about-backdrop">
  <h2>EVE Settings Editor</h2>
  <p class="version">版本 {version}</p>
  <p>
    <Button variant="ghost" class="linkbtn" onclick={() => void openUrl(REPO).catch(() => {})}>
      GitHub 上的源码与问题反馈
    </Button>
  </p>
  <p class="meta">采用 MIT 许可证。非官方工具 —— EVE Online 是 CCP hf 的商标。</p>

  {#snippet footer()}
    <Button onclick={onClose}>关闭</Button>
  {/snippet}
</Sheet>

<style>
  h2 {
    margin: 0 0 var(--s1);
    font-size: var(--t-title);
    font-weight: 600;
  }
  .version {
    margin: 0 0 var(--s3);
    color: var(--text-muted);
  }
  .meta {
    color: var(--text-muted);
    font-size: var(--t-caption);
    margin: var(--s3) 0 0;
  }
  /* The link shape is the only thing left of the old .linkbtn; the button
     behaviour underneath it is Button's. */
  :global(.linkbtn) {
    color: var(--accent);
    padding: 0;
  }
  :global(.linkbtn:hover) {
    text-decoration: underline;
    background: none;
  }
</style>
