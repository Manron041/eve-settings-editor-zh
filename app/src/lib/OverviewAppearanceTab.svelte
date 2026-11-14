<script lang="ts">
  import { api, errMessage, errText, type OverviewColumns, type Rgba } from "./api";
  import { snapToPalette, UNSET_HEX } from "./colour";
  import InlineMessage from "./ui/InlineMessage.svelte";
  import {
    stateLabel, rgbaToHex, hexToRgba, moveInOrder, defaultColor,
    DEFAULT_BACKGROUND_ORDER, DEFAULT_BACKGROUND_STATES,
    DEFAULT_FLAG_ORDER, DEFAULT_FLAG_STATES,
  } from "./states";
  import Button from "./ui/Button.svelte";
  import Field from "./ui/Field.svelte";
  import ListRow from "./ui/ListRow.svelte";
  import PanelHeader from "./ui/PanelHeader.svelte";
  import Tabs from "./ui/Tabs.svelte";

  let { data, onChanged, onUserDirty }:
    { data: OverviewColumns | null;
      onChanged: (next: OverviewColumns) => void; onUserDirty: () => void } = $props();

  // EVE's own Appearance labels, in EVE's own order.
  const BOOL_LABELS: [string, string][] = [
    ["useSmallColorTags", "使用小色标"],
    ["useSmallText", "使用小字号"],
    ["applyToStructures", "同样应用于建筑"],
    ["applyToOtherObjects", "同样应用于太空中的其他物体"],
    ["overviewBroadcastsToTop", "在顶部显示舰队广播"],
    ["hideCorpTicker", "隐藏军团简称"],
  ];

  let surface = $state<"Background" | "Colortag">("Background");

  const appearance = $derived(data?.appearance ?? null);
  const isBg = $derived(surface === "Background");
  const stored = $derived(isBg ? appearance?.background : appearance?.flag);
  // Fall back to EVE's bundled defaults PER SURFACE, not on `appearance.defaulted`
  // (which is true only while all four keys are absent): editing Background
  // materialises its two keys and flips that flag false, and a global fallback
  // would then render Colortag as an empty, un-tickable list. A surface counts as
  // un-materialised only when BOTH its lists are empty — unticking every state
  // leaves `enabled` empty but `order` intact, which must not re-show defaults.
  const surfaceUnset = $derived(!stored?.order.length && !stored?.enabled.length);
  const order = $derived(
    surfaceUnset ? (isBg ? DEFAULT_BACKGROUND_ORDER : DEFAULT_FLAG_ORDER) : (stored?.order ?? []),
  );
  const enabled = $derived(
    surfaceUnset ? (isBg ? DEFAULT_BACKGROUND_STATES : DEFAULT_FLAG_STATES) : (stored?.enabled ?? []),
  );
  // Iterate `order` verbatim — it's a priority list and carries ids the client
  // never draws (68), which must keep their slots, so they stay in `rows` (and
  // thus in every reorder) even though the markup skips drawing them. An enabled
  // id somehow absent from it is appended so it stays reachable instead of being
  // invisible and impossible to untick.
  const rows = $derived([...order, ...enabled.filter((id) => !order.includes(id))]);
  const enabledSet = $derived(new Set(enabled));
  // Colours are per surface in the file — `(background, id)` and `(flag, id)`
  // are different entries — so they follow the sub-tab. Reading only the
  // background list is what left a pack's colortag colours (Z-S sets `flag_48`)
  // in the file with nothing on screen able to show, review or undo them.
  const colors = $derived(new Map((isBg ? appearance?.colors : appearance?.flag_colors) ?? []));
  const bools = $derived(new Map(appearance?.bools ?? []));

  // EVE's palette, from the model. A pack stores colours by NAME, and
  // `overview_pack::color_name` matches the floats EXACTLY, so a colour that is
  // not one of these is silently dropped from a pack export — which the row
  // below says out loud. All twelve of the client's names (`PALETTE`).
  const palette = $derived(appearance?.palette ?? []);
  const paletteName = (c: Rgba): string | undefined =>
    palette.find(([, p]) => p.every((n, i) => n === c[i]))?.[0];

  // At the top of the sub-tab, which is the control group that owns every failure
  // this function can report. This tab is mounted-but-hidden when another
  // sub-tab is showing, so `escalate` matters here more than anywhere: an error
  // rendered into a panel nobody is looking at is a silent failure, and a modal
  // never was one.
  let error = $state<{ text: string; detail: string } | null>(null);

  async function edit(fn: () => Promise<OverviewColumns>) {
    error = null;
    try { onChanged(await fn()); onUserDirty(); }
    catch (e) {
      error = {
        text: `该外观设置未能修改 — ${errText(e)}`,
        detail: errMessage(e),
      };
    }
  }

  // Enabled and order are independent lists: a toggle writes only *States2, a
  // drag only *Order2 — never a coupled write. The one exception is the FIRST
  // edit on an un-materialised surface: both lists are showing EVE's bundled
  // defaults, so writing one alone leaves the other absent while `surfaceUnset`
  // flips false, and the list we never wrote would then render as empty (every
  // state unticked, or the priority order lost) instead of as the defaults the
  // user was just looking at.
  function toggleState(id: number, on: boolean) {
    const next = on ? [...enabled, id] : enabled.filter((n) => n !== id);
    const materialise = surfaceUnset;
    return edit(async () => {
      if (materialise) await api.overviewSetStates(isBg ? "backgroundOrder" : "flagOrder", order);
      return api.overviewSetStates(isBg ? "background" : "flag", next);
    });
  }

  let dragFrom = $state<number | null>(null);
  function drop(to: number) {
    if (dragFrom === null) return;
    const from = dragFrom;
    dragFrom = null;
    if (from === to) return;
    const next = moveInOrder(rows, from, to);
    const materialise = surfaceUnset;
    return edit(async () => {
      if (materialise) await api.overviewSetStates(isBg ? "background" : "flag", enabled);
      return api.overviewSetStates(isBg ? "backgroundOrder" : "flagOrder", next);
    });
  }

  // Alpha isn't exposed; carry the stored one through so a non-1.0 entry keeps it.
  function setColor(id: number, hex: string) {
    const alpha = colors.get(id)?.[3] ?? 1;
    // See colour.ts for why a palette hex must write the palette's exact floats.
    const exact = snapToPalette(hex, palette);
    const rgba: Rgba = exact ? [exact[0], exact[1], exact[2], alpha] : hexToRgba(hex, alpha);
    return edit(() => api.overviewSetStateColor(isBg ? "background" : "flag", id, rgba));
  }
  // Removing the entry is what restores EVE's default — writing a default-looking
  // colour is not the same thing.
  function resetColor(id: number) {
    return edit(() => api.overviewSetStateColor(isBg ? "background" : "flag", id, null));
  }
</script>

{#if appearance}
  <!-- The tab list beside this keeps a row highlighted; this pane ignores it. -->
  <div class="pane-head"><PanelHeader title="外观" subtitle="账号范围：适用于每个标签页" level={4} /></div>
  {#if error}
    <InlineMessage variant="error" detail={error.detail}>{error.text}</InlineMessage>
  {/if}
  <div class="bools">
    {#each BOOL_LABELS as [key, label] (key)}
      {#if key === "applyToStructures"}
        <p class="apply-note">色标和背景设置默认应用于舰船与无人机。</p>
      {/if}
      <Field
        kind="checkbox"
        class="bool-row"
        {label}
        value={bools.get(key) ?? false}
        onchange={(e) => edit(() => api.overviewSetBool(key, (e.currentTarget as HTMLInputElement).checked))} />
    {/each}
  </div>

  <!-- EVE's own Appearance tab lists Colortag first, Background second.
       Tabs brings the roving tabindex and arrow-key movement this strip never
       had: it set role="tab" and aria-selected and stopped there. -->
  <Tabs
    variant="underline"
    class="surfaces"
    ariaLabel="外观面板"
    tabs={[
      { id: "Colortag", label: "色标" },
      { id: "Background", label: "背景" },
    ]}
    bind:value={surface} />

  {#if surfaceUnset}
    <p class="meta">此账号从未自定义过其 {surface} 状态，因此这些是 EVE 的默认值，尚未保存。你在此处的首次修改会将它们写入文件。</p>
  {/if}

  <!-- The palette as suggestions in the native colour picker. It is a hint, not
       a constraint: free-form stays available, and a picked palette colour is
       snapped to EVE's exact floats by `setColor` so it survives a pack export.
       Suggestions rather than the only choices: EVE's own picker is free-form
       too, and a pack is only one of the places a colour goes. -->
  <datalist id="eve-palette">
    {#each palette as [name, c] (name)}<option value={rgbaToHex(c)}></option>{/each}
  </datalist>

  <ul class="state-list">
    {#each rows as id, i (id)}
      <!-- An id with no label is one the client never draws (68): EVE's own
           Appearance list has no row for it, so neither do we. It stays in
           `rows`, keeping its slot through every reorder. -->
      {#if stateLabel(id)}
      <li>
        <ListRow
          draggable
          ondragstart={(e) => { dragFrom = i;
            // WebView2/Chromium won't fire `drop` unless dragstart sets data.
            e.dataTransfer?.setData("text/plain", String(i));
            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }}
          ondragover={(e) => { e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move"; }}
          ondrop={(e) => { e.preventDefault(); drop(i); }}
          ondragend={() => (dragFrom = null)}>
          <Field
            kind="checkbox"
            class="state-label"
            label={stateLabel(id) ?? undefined}
            value={enabledSet.has(id)}
            onchange={(e) => toggleState(id, (e.currentTarget as HTMLInputElement).checked)} />
          {#snippet trailing()}
            {@const c = colors.get(id)}
            <!-- The bundled defaults were sampled off EVE's *Background* list and
                 are reused for Colortag, which is an assumption (EVE tints a
                 state's tag and its row alike) rather than a measurement. They
                 are display only and never written, so if it is wrong it costs a
                 swatch, not a file. -->
            {@const fallback = defaultColor(id)}
            <Field
              kind="color"
              list="eve-palette"
              controlClass={!c && !fallback ? "unset" : ""}
              value={c ? rgbaToHex(c) : (fallback ?? UNSET_HEX)}
              ariaLabel={isBg ? "背景颜色" : "色标颜色"}
              onchange={(e) => setColor(id, (e.currentTarget as HTMLInputElement).value)} />
            <!-- `palette.length` guards the empty case: no palette means we
                 cannot tell, and "we cannot tell" must not be shown as "this
                 will be dropped". -->
            {#if c && palette.length > 0 && !paletteName(c)}
              <span class="off-palette"
                    title="此精确颜色不是 EVE 的 {palette.length} 种调色板颜色之一，而配置包只能命名这些颜色，因此导出配置包时会遗漏此状态。">非调色板色</span>
            {/if}
            {#if c}
              <Button size="sm" class="reset" onclick={() => resetColor(id)}
                      title="移除已保存的颜色，恢复 EVE 默认">重置</Button>
            {:else}
              <span class="default-note"
                    title={fallback
                      ? "无已保存的颜色 — 这是 EVE 为此状态内置的默认值"
                      : "无已保存的颜色，且此状态的 EVE 内置默认值未知"}>默认</span>
            {/if}
          {/snippet}
        </ListRow>
      </li>
      {/if}
    {/each}
  </ul>
{/if}

<style>
  .pane-head { margin-bottom: var(--s2); }
  /* The checkbox and colour-input dark-control rules are gone — Field owns
     both, and the local surface strip is Tabs.

     This strip was `.subtabs` until 2026-08-15, the same class OverviewView uses
     for the view-level strip — and since only this file declared the rule, and
     `:global` is required to reach into a child component, the PARENT's margin
     was being supplied by a child that merely happens to always be mounted
     (the sub-tabs render with `hidden`, never unmounted). Distinct names now, one
     rule each, same computed margin. */
  .bools { display: flex; flex-direction: column; gap: 0; margin-bottom: var(--s2); }
  .apply-note { color: var(--text-muted); font-size: var(--t-caption); margin: var(--s1) 0 0; }
  .meta { color: var(--text-muted); font-size: var(--t-caption); }
  :global(.surfaces) { margin: var(--s1) 0 var(--s2); }
  /* A reading width, for the same reason `.ov-cols` has one: ListRow pushes the
     swatch and its Reset button to the container's right edge, and the
     container is a wide work area rather than a 20rem panel. */
  .state-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0; max-width: 26rem; }
  .state-list li { list-style: none; }
  .state-list :global(.state-label) { flex: 1; }
  /* An unset row shows a placeholder colour, so it takes the one disabled
     treatment to keep "unset" and "explicitly set" visually distinct. */
  .state-list :global(.unset) { opacity: var(--o-disabled); }
  .default-note { color: var(--text-muted); font-size: var(--t-caption); width: 3.4rem; }
  .off-palette { color: var(--warn); font-size: var(--t-caption); white-space: nowrap; }
  .state-list :global(.reset) { width: 3.4rem; }
</style>
