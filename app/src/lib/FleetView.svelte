<script lang="ts">
  import { api, errMessage, errText, type Fleet, type FoundCharacter, type HudEntry, type Rgb } from "./api";
  import { BROADCASTS, FORMATIONS, SHOW_OWN, listenField } from "./fleet";
  import { hexToRgb, rgbToHex, snapToPalette, UNSET_HEX } from "./colour";
  import { names, resolveNames } from "./names.svelte";
  import { toast } from "./ui/toasts.svelte";
  import { undoAction } from "./undo.svelte";
  import Button from "./ui/Button.svelte";
  import Chip from "./ui/Chip.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import Field from "./ui/Field.svelte";
  import InlineMessage from "./ui/InlineMessage.svelte";
  import ListRow from "./ui/ListRow.svelte";
  import Panel from "./ui/Panel.svelte";
  import PanelHeader from "./ui/PanelHeader.svelte";

  let {
    charOpen, userOpen, userId = null, charId = null, refreshToken = 0,
    onUserDirty, onCharDirty, onShowAccounts = () => {},
  }: {
    charOpen: boolean;
    userOpen: boolean;
    userId?: number | null;
    charId?: number | null;
    /** Bumped by every save, open, discard, backup restore and undo — the only
     *  signal that the documents changed underneath this view. */
    refreshToken?: number;
    onUserDirty: () => void;
    onCharDirty: () => void;
    onShowAccounts?: () => void;
  } = $props();

  let fleet = $state<Fleet | null>(null);
  let loadError = $state<string | null>(null);
  // One live message per panel — the panel is the control group that owns the
  // failure, and each handler nulls its own before it starts (05 §3.1).
  type Msg = { text: string; detail: string };
  type PanelId = "broadcast" | "watch" | "formation";
  let broadcastError = $state<Msg | null>(null);
  let watchError = $state<Msg | null>(null);
  let formationError = $state<Msg | null>(null);
  function setError(panel: PanelId, m: Msg | null) {
    if (panel === "broadcast") broadcastError = m;
    else if (panel === "watch") watchError = m;
    else formationError = m;
  }

  async function reload() {
    if (!charOpen && !userOpen) { fleet = null; return; }
    loadError = null;
    try {
      fleet = await api.fleet();
      void resolveNames(fleet.watchlist.map((w) => w.char_id));
    } catch (e) { loadError = errMessage(e); }
  }
  $effect(() => { void charOpen; void userOpen; void userId; void charId; void refreshToken; reload(); });

  const palette = $derived(fleet?.palette ?? []);
  const field = (name: string): HudEntry | undefined => fleet?.fields.find((f) => f.name === name);
  /** The stored value, or EVE's default when the key is absent. */
  const shown = (name: string): string => { const e = field(name); return e?.value ?? e?.default ?? ""; };
  const unavailable = (name: string): boolean => field(name)?.set.how === "unavailable";
  const NOT_EDITABLE = "此处该值的类型不符合预期";

  const colourEntry = (broadcast: string) => fleet?.colours.find((c) => c.broadcast === broadcast);
  /** What the swatch shows: the stored colour, else the type's default, else nothing. */
  function swatchRgb(broadcast: string): Rgb | null {
    const c = colourEntry(broadcast);
    if (!c) return null;
    if (c.state.state === "set") return c.state.rgb;
    if (c.state.state === "absent") return c.default;
    return null;
  }
  /** Whether ✕ has anything left to do. */
  function noColour(broadcast: string): boolean {
    const c = colourEntry(broadcast);
    return !c || c.state.state === "cleared" || (c.state.state === "absent" && c.default === null);
  }

  /** Run one write, replace the projection, mark the right file dirty; on
   *  failure put the R4 sentence on the panel that owns the control. */
  async function write(panel: PanelId, subject: string, fn: () => Promise<Fleet>, dirty: () => void): Promise<boolean> {
    setError(panel, null);
    try {
      fleet = await fn();
      dirty();
      return true;
    } catch (e) {
      setError(panel, { text: `${subject} — ${errText(e)}`, detail: errMessage(e) });
      return false;
    }
  }

  const setBroadcastField = (name: string, on: boolean) =>
    write("broadcast", "该广播设置未更改", () => api.setFleetField(name, on ? "1" : "0"), onUserDirty);
  const pickColour = (broadcast: string, hex: string) =>
    write("broadcast", "该颜色未更改", () => api.setFleetColour(broadcast, snapToPalette(hex, palette) ?? hexToRgb(hex)), onUserDirty);
  const clearColour = (broadcast: string) =>
    write("broadcast", "该颜色未更改", () => api.setFleetColour(broadcast, null), onUserDirty);

  const checked = (e: Event) => (e.currentTarget as HTMLInputElement).checked;
  const picked = (e: Event) => (e.currentTarget as HTMLInputElement).value;

  // --- watch list ---------------------------------------------------------
  const nameOf = (id: number): string => names[id]?.name ?? String(id);
  let addQuery = $state("");
  // Blue is what 863 of the corpus's 1,382 entries chose; the other 519 are all
  // one other colour, so it is the right starting swatch.
  let addHex = $state(rgbToHex([0.2, 0.5, 1.0]));
  let adding = $state(false);

  const recolour = (id: number, hex: string) =>
    write("watch", `${nameOf(id)} 的颜色未更改`, () => api.setWatchlistColour(id, snapToPalette(hex, palette) ?? hexToRgb(hex)), onCharDirty);
  const remove = (id: number) =>
    write("watch", `${nameOf(id)} 未移除`, () => api.setWatchlistColour(id, null), onCharDirty);

  async function add(ev: SubmitEvent) {
    ev.preventDefault();
    const q = addQuery.trim();
    if (!q || adding) return;
    watchError = null;
    adding = true;
    try {
      // A numeric id already on the list needs no lookup at all — the id IS
      // the membership key, so this check runs before the ESI round-trip a
      // name only resolves after. `Number(q)` on a non-numeric query is NaN,
      // which no real char_id equals, so this is a no-op for a name query.
      if (fleet?.watchlist.some((w) => w.char_id === Number(q))) {
        watchError = { text: `${nameOf(Number(q))} 已在列表中`, detail: "" };
        return;
      }
      let found: FoundCharacter | null;
      try { found = await api.lookupCharacter(q); }
      catch (e) { watchError = { text: `${q} 查询失败 — 无法连接 ESI`, detail: errMessage(e) }; return; }
      if (!found) { watchError = { text: `没有名为 ${q} 的角色`, detail: "" }; return; }
      const id = found.id;
      if (fleet?.watchlist.some((w) => w.char_id === id)) { watchError = { text: `${found.name} 已在列表中`, detail: "" }; return; }
      const rgb = snapToPalette(addHex, palette) ?? hexToRgb(addHex);
      const ok = await write("watch", `${found.name} 未添加`, () => api.setWatchlistColour(id, rgb), onCharDirty);
      if (ok) {
        void resolveNames([id]);
        addQuery = "";
        // The new row can land below the fold, so the success is said out loud.
        toast(`已添加 ${found.name}`, { action: undoAction() });
      }
    } finally { adding = false; }
  }

  // --- formation ----------------------------------------------------------
  const setFormationField = (name: string, text: string) =>
    write("formation", "该阵型设置未更改", () => api.setFleetField(name, text), onCharDirty);

  // Int fields: round before writing, and put the input back in step with the
  // model whether or not the write landed — Svelte only patches `value` when
  // the expression changes, so a refused edit would otherwise sit on screen
  // beside a value that is not it (HudPanel's discipline).
  const numberEdit = (name: string) => async (ev: Event) => {
    const el = ev.target as HTMLInputElement;
    const text = el.value;
    if (text.trim() !== "" && Number.isFinite(Number(text))) {
      await setFormationField(name, String(Math.round(Number(text))));
    }
    el.value = shown(name);
  };
  // A value outside EVE's six (a newer client's) stays visible as its raw id.
  const formationOptions = $derived.by(() => {
    const v = shown("formation");
    const known = FORMATIONS.map((f) => ({ value: f.id, label: f.label }));
    return known.some((o) => o.value === v) ? known : [...known, { value: v, label: v }];
  });
  // Same put-back as `numberEdit`: a refused pick must not stay on screen.
  const formationEdit = async (ev: Event) => {
    const el = ev.target as HTMLSelectElement;
    await setFormationField("formation", el.value);
    el.value = shown("formation");
  };
  const NUMBERS: { name: string; label: string; step: number }[] = [
    { name: "formation_size", label: "大小", step: 100 },
    { name: "formation_spacing", label: "间距", step: 100 },
  ];
</script>

<div class="fleet">
  {#if loadError}
    <InlineMessage variant="error">{loadError}</InlineMessage>
  {/if}
  <!-- The palette as suggestions in the native colour picker: a hint, not a
       constraint. A picked palette colour is snapped to EVE's exact floats. -->
  <datalist id="fleet-palette">
    {#each palette as [name, c] (name)}<option value={rgbToHex(c)}></option>{/each}
  </datalist>

  <Panel class="broadcasts">
    <PanelHeader title="广播设置" subtitle="你接收哪些广播，以及各广播显示的颜色">
      {#snippet actions()}<Chip size="sm">账户文件</Chip>{/snippet}
    </PanelHeader>
    {#if !userOpen}
      <EmptyState title="尚未配对账户" description="广播设置保存在账户文件中。">
        {#snippet action()}<Button onclick={onShowAccounts}>配对此角色…</Button>{/snippet}
      </EmptyState>
    {:else if fleet}
      {#if broadcastError}
        <InlineMessage variant="error" detail={broadcastError.detail}>{broadcastError.text}</InlineMessage>
      {/if}
      <div class="rows">
        <!-- EVE's own layout: checkbox, label, then the swatch. Field's label
             wraps the checkbox, so the whole caption is the hit target. -->
        <div class="row">
          <Field kind="checkbox" label={SHOW_OWN.label} value={shown(SHOW_OWN.field) === "1"}
            disabled={unavailable(SHOW_OWN.field)} disabledReason={NOT_EDITABLE}
            onchange={(e) => setBroadcastField(SHOW_OWN.field, checked(e))} />
          <span></span>
        </div>
        {#each BROADCASTS as b (b.type)}
          {@const name = listenField(b.type)}
          {@const rgb = swatchRgb(b.type)}
          {@const unreadable = colourEntry(b.type)?.state.state === "unreadable"}
          <div class="row">
            <Field kind="checkbox" label={b.label} value={shown(name) === "1"}
              disabled={unavailable(name)} disabledReason={NOT_EDITABLE}
              onchange={(e) => setBroadcastField(name, checked(e))} />
            <span class="colour">
              <!-- An unset swatch shows a placeholder and takes the one disabled
                   treatment, so "no colour" and "black" cannot be confused —
                   the appearance tab's convention. -->
              <Field kind="color" list="fleet-palette" controlClass={rgb ? "" : "unset"}
                value={rgb ? rgbToHex(rgb) : UNSET_HEX}
                ariaLabel="{b.label} 的颜色" title={rgb ? undefined : "无颜色"}
                disabled={unreadable} disabledReason={NOT_EDITABLE}
                onchange={(e) => pickColour(b.type, picked(e))} />
              <Button variant="ghost" size="sm" iconOnly title="无颜色"
                disabled={noColour(b.type)} disabledReason="已无颜色"
                onclick={() => clearColour(b.type)}>✕</Button>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </Panel>

  <Panel class="watchlist">
    <PanelHeader title="监视列表颜色" subtitle="舰队成员在监视列表中显示的颜色">
      {#snippet actions()}<Chip size="sm">角色文件</Chip>{/snippet}
    </PanelHeader>
    {#if !charOpen}
      <EmptyState title="未打开角色文件" description="监视列表颜色保存在角色文件中。" />
    {:else if fleet}
      {#if watchError}
        <InlineMessage variant="error" detail={watchError.detail || undefined}>{watchError.text}</InlineMessage>
      {/if}
      {#if fleet.watchlist.length === 0}
        <EmptyState title="尚无监视列表颜色"
          description="你在游戏内为监视列表成员设置的颜色会显示在此处。在下方添加一个，即可在下次组队前为角色设置颜色。" />
      {:else}
        <ul class="watch-list">
          {#each fleet.watchlist as w (w.char_id)}
            {@const label = nameOf(w.char_id)}
            <li>
              <ListRow title={String(w.char_id)}>
                {#snippet leading()}
                  <Field kind="color" list="fleet-palette" controlClass={w.rgb ? "" : "unset"}
                    value={w.rgb ? rgbToHex(w.rgb) : UNSET_HEX} ariaLabel="{label} 的颜色"
                    disabled={w.rgb === null} disabledReason={NOT_EDITABLE}
                    onchange={(e) => recolour(w.char_id, picked(e))} />
                {/snippet}
                <span class="label">{label}</span>
                {#snippet trailing()}
                  {#if w.rgb === null}<Chip tone="warn" size="sm">不可读</Chip>{/if}
                  {#if label !== String(w.char_id)}<span class="meta">{w.char_id}</span>{/if}
                  <Button variant="ghost" size="sm" iconOnly title="从列表移除"
                    onclick={() => remove(w.char_id)}>✕</Button>
                {/snippet}
              </ListRow>
            </li>
          {/each}
        </ul>
      {/if}
      <form class="add" onsubmit={add}>
        <Field kind="text" label="添加角色" placeholder="名称或 ID" width="18rem" bind:value={addQuery} />
        <Field kind="color" list="fleet-palette" ariaLabel="新条目的颜色" bind:value={addHex} />
        <Button variant="primary" type="submit" disabled={addQuery.trim() === "" || adding}
          disabledReason={adding ? "正在查询角色…" : "输入角色名称或 ID"}>添加</Button>
      </form>
    {/if}
  </Panel>

  <Panel class="formation">
    <PanelHeader title="阵型" subtitle="舰队跃迁阵型与舰队查找器">
      {#snippet actions()}<Chip size="sm">角色文件</Chip>{/snippet}
    </PanelHeader>
    {#if !charOpen}
      <EmptyState title="未打开角色文件" description="阵型设置保存在角色文件中。" />
    {:else if fleet}
      {#if formationError}
        <InlineMessage variant="error" detail={formationError.detail}>{formationError.text}</InlineMessage>
      {/if}
      <div class="rows">
        <!-- Label always first, checkbox row included — HudPanel's shape
             (HudPanel.svelte ~219-223): a Field with its own `label` puts a
             control in the label column on some rows and a caption in it on
             others, so nothing lines up. A bare Field plus a leading label
             span keeps every control in the same track. -->
        <div class="row">
          <span class="label">阵型</span>
          <Field kind="select" ariaLabel="阵型" width="8rem" options={formationOptions}
            value={shown("formation")} disabled={unavailable("formation")} disabledReason={NOT_EDITABLE}
            onchange={formationEdit} />
          <span></span>
        </div>
        {#each NUMBERS as n (n.name)}
          <div class="row">
            <span class="label">{n.label}</span>
            <Field kind="number" ariaLabel={n.label} min={0} step={n.step} width="8rem"
              value={shown(n.name)} disabled={unavailable(n.name)} disabledReason={NOT_EDITABLE}
              onchange={numberEdit(n.name)} />
            <span class="meta">m</span>
          </div>
        {/each}
        <div class="row">
          <span class="label">仅显示我的军团、联盟和高声望舰队</span>
          <Field kind="checkbox" ariaLabel="仅显示我的军团、联盟和高声望舰队"
            value={shown("finder_group_only") === "1"}
            disabled={unavailable("finder_group_only")} disabledReason={NOT_EDITABLE}
            onchange={(e) => setFormationField("finder_group_only", checked(e) ? "1" : "0")} />
          <span></span>
        </div>
      </div>
      <p class="meta">已保存的舰队配置存于 CCP 服务器，无法在此编辑。</p>
    {/if}
  </Panel>
</div>

<style>
  .fleet { display: flex; flex-direction: column; gap: var(--s4); max-width: 56rem; }
  /* Grid on the CONTAINER, rows as `display: contents` — HudPanel's shape
     (`HudPanel.svelte`'s `.group`/`.row`). A grid on each row instead resolves
     its tracks independently, so the swatch column trails the caption at
     sixteen different x positions rather than sharing one.
     `:global(.broadcasts)`: that class lands on Panel's own root element, a
     child component's DOM, not an element this file writes directly — Svelte
     can't verify the ancestor across that boundary and flags the plain
     selector as unused (same reason AccountsView reaches into Panel's
     `.capture` through `:global()`, the other direction). */
  :global(.broadcasts) .rows {
    display: grid;
    grid-template-columns: max-content max-content;
    column-gap: var(--s3);
    row-gap: var(--s1);
    justify-content: start;
    align-items: center;
  }
  :global(.broadcasts) .row { display: contents; }
  .colour { display: flex; align-items: center; gap: var(--s1); }
  /* The one sanctioned opacity: a placeholder swatch is not content. */
  .colour :global(.unset) { opacity: var(--o-disabled); }

  :global(.formation) .rows {
    display: grid;
    grid-template-columns: max-content 8rem auto;
    column-gap: var(--s3);
    row-gap: var(--s1);
    align-items: center;
    justify-content: start;
  }
  :global(.formation) .row { display: contents; }
  :global(.formation) .label { color: var(--text-secondary); font-size: var(--t-body); }

  .watch-list { list-style: none; margin: 0; padding: 0; max-width: 32rem; }
  .meta { color: var(--text-muted); font-size: var(--t-caption); }
  .add { display: flex; align-items: flex-end; gap: var(--s2); margin-top: var(--s3); }
</style>
