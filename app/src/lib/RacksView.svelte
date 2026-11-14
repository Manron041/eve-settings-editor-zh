<script lang="ts">
  import { api, errMessage, errText, type SlotEntry } from "./api";
  import Button from "./ui/Button.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import Field from "./ui/Field.svelte";
  import InlineMessage from "./ui/InlineMessage.svelte";
  import ListRow from "./ui/ListRow.svelte";
  import SearchField from "./ui/SearchField.svelte";

  let { userOpen, userId = null, refreshToken = 0, onUserDirty }: {
    userOpen: boolean;
    userId?: number | null;
    /** Bumped by every save, open, discard, restore and undo (see FleetView). */
    refreshToken?: number;
    onUserDirty: () => void;
  } = $props();

  /** Inventory flag → the name players use: high H1–H8, mid M1–M8, low L1–L8. */
  const slotLabel = (f: number) => (f >= 27 ? `H${f - 26}` : f >= 19 ? `M${f - 18}` : `L${f - 10}`);
  const rackOf = (f: number) => (f >= 27 ? "high" : f >= 19 ? "mid" : "low");
  // Position p is row p/8: the client's InitDrawSlots, spec §2.2.
  const ROWS = [
    { name: "顶部槽位架", from: 0 },
    { name: "中部槽位架", from: 8 },
    { name: "底部槽位架", from: 16 },
  ];

  let ships = $state<SlotEntry[] | null>(null);
  let loadError = $state<string | null>(null);
  let actionError = $state<{ text: string; detail: string } | null>(null);
  let selectedId = $state<number | null>(null);
  let filter = $state("");
  /** The slot clicked first, waiting for the slot to swap it with. */
  let picked = $state<number | null>(null);
  let newId = $state("");
  let copyTo = $state<Set<number>>(new Set());

  async function reload() {
    if (!userOpen) { ships = null; return; }
    loadError = null;
    try { ships = await api.slotOrders(); } catch (e) { loadError = errMessage(e); }
  }
  $effect(() => { void userOpen; void userId; void refreshToken; reload(); });

  const shown = $derived((ships ?? []).filter((s) => String(s.ship_id).includes(filter.trim())));
  const current = $derived(ships?.find((s) => s.ship_id === selectedId) ?? null);
  // A different ship starts with nothing picked and nothing ticked.
  $effect(() => { void selectedId; picked = null; copyTo = new Set(); });

  async function write(subject: string, fn: () => Promise<SlotEntry[]>): Promise<boolean> {
    actionError = null;
    try {
      ships = await fn();
      onUserDirty();
      return true;
    } catch (e) {
      actionError = { text: `${subject} — ${errText(e)}`, detail: errMessage(e) };
      return false;
    }
  }

  function swap(a: number, b: number) {
    picked = null;
    const ship = current;
    if (ship && a !== b) void write("这些槽位未交换", () => api.swapSlots(ship.ship_id, a, b));
  }
  function pick(flag: number) {
    if (picked === null) picked = flag;
    else swap(picked, flag);
  }

  const parsedNewId = $derived(/^\d+$/.test(newId.trim()) ? Number(newId.trim()) : null);
  const newIdTaken = $derived(parsedNewId !== null && !!ships?.some((s) => s.ship_id === parsedNewId));
  async function add() {
    if (parsedNewId === null || newIdTaken) return;
    const id = parsedNewId;
    const from = current?.order ? current.ship_id : null;
    if (await write(`舰船 ${id} 未添加`, () => api.addSlotOrder(id, from))) {
      selectedId = id;
      newId = "";
    }
  }
  async function remove() {
    if (!current) return;
    const id = current.ship_id;
    if (await write(`舰船 ${id} 未移除`, () => api.removeSlotOrder(id))) selectedId = null;
  }
  function toggleCopy(id: number) {
    const next = new Set(copyTo);
    next.has(id) ? next.delete(id) : next.add(id);
    copyTo = next;
  }
  // Only ships still listed: a ticked ship hidden by the filter is not copied to.
  const visibleCopyTo = $derived([...copyTo].filter((id) => shown.some((s) => s.ship_id === id)));
  async function copy() {
    if (!current || visibleCopyTo.length === 0) return;
    const from = current.ship_id;
    const to = visibleCopyTo;
    if (await write("该布局未复制", () => api.copySlotOrder(from, to))) copyTo = new Set();
  }
</script>

<div class="racks">
  {#if !userOpen}
    <EmptyState title="打开账户文件以编辑其舰船布局。" />
  {:else if loadError}
    <InlineMessage variant="error">{loadError}</InlineMessage>
  {:else if ships}
    <div class="cols">
      <div class="list">
        <SearchField verb="filter" nouns="舰船 ID" bind:value={filter} count={shown.length} total={ships.length} />
        {#if ships.length === 0}
          <EmptyState
            title="尚无舰船保存了布局。"
            description="EVE 会在你首次将模块拖到舰船 HUD 上时保存布局。" />
        {/if}
        {#each shown as s (s.ship_id)}
          <ListRow selected={s.ship_id === selectedId} onclick={() => (selectedId = s.ship_id)}>
            {s.ship_id}{#if !s.order}<span class="muted"> · 不可读</span>{/if}
          </ListRow>
        {/each}
        <div class="add">
          <Field kind="text" label="舰船 ID" layout="column" bind:value={newId} />
          <Button
            size="sm"
            disabled={parsedNewId === null || newIdTaken}
            disabledReason={newIdTaken ? "该舰船已在列表中" : "输入舰船的物品 ID"}
            onclick={add}>添加舰船</Button>
        </div>
      </div>

      <div class="editor">
        {#if !current}
          <EmptyState title="选择一艘舰船以查看其槽位架。" />
        {:else}
          <h3>舰船 {current.ship_id}</h3>
          {#if current.order}
            {@const order = current.order}
            {#each ROWS as row, r}
              <div class="row" class:middle={r === 1} role="group" aria-label={row.name}>
                {#each order.slice(row.from, row.from + 8) as flag (flag)}
                  <button
                    type="button"
                    class="slot {rackOf(flag)}"
                    class:picked={picked === flag}
                    aria-pressed={picked === flag}
                    draggable="true"
                    ondragstart={(e) => e.dataTransfer?.setData("text/plain", String(flag))}
                    ondragover={(e) => e.preventDefault()}
                    ondrop={(e) => {
                      e.preventDefault();
                      const from = Number(e.dataTransfer?.getData("text/plain"));
                      if (from) swap(from, flag);
                    }}
                    onclick={() => pick(flag)}>{slotLabel(flag)}</button>
                {/each}
              </div>
            {/each}
            <p class="muted">点击两个槽位，或将一个拖到另一个上即可交换，与游戏内 HUD 上的操作一致。</p>
          {:else}
            <InlineMessage variant="warn">此舰船的布局处于编辑器无法读取的格式。移除它可让该舰船恢复 EVE 的默认布局。</InlineMessage>
          {/if}
          <div class="actions">
            <Button variant="danger" size="sm" onclick={remove}>移除舰船</Button>
          </div>
          {#if current.order && ships.length > 1}
            <div class="copy">
              <div class="head">复制此布局到</div>
              {#each shown.filter((s) => s.ship_id !== current.ship_id) as s (s.ship_id)}
                <Field
                  kind="checkbox"
                  label={`复制到 ${s.ship_id}`}
                  value={copyTo.has(s.ship_id)}
                  onchange={() => toggleCopy(s.ship_id)} />
              {/each}
              <Button
                size="sm"
                disabled={visibleCopyTo.length === 0}
                disabledReason="至少勾选一艘舰船"
                onclick={copy}>复制布局</Button>
            </div>
          {/if}
        {/if}
        {#if actionError}
          <InlineMessage variant="error" detail={actionError.detail}>{actionError.text}</InlineMessage>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .racks { max-width: 64rem; --slot: 2.75rem; }
  .cols { display: grid; grid-template-columns: minmax(12rem, 18rem) 1fr; gap: var(--s4); }
  .list, .editor { display: flex; flex-direction: column; gap: var(--s2); min-width: 0; }
  .add { display: flex; gap: var(--s2); align-items: end; }
  .row { display: flex; gap: var(--s1); }
  /* The client draws the middle rack half a button to the right (grid x 1.5). */
  .row.middle { transform: translateX(calc((var(--slot) + var(--s1)) / 2)); }
  .slot {
    width: var(--slot); height: var(--slot); border-radius: var(--r-pill);
    border: 1px solid var(--border); background: var(--surface-raised); color: var(--text);
    font: inherit; cursor: grab;
  }
  .slot.high { border-color: var(--accent); }
  .slot.low { border-style: dashed; }
  .slot.picked { outline: 2px solid var(--accent); outline-offset: 2px; }
  .actions, .copy { display: flex; flex-direction: column; gap: var(--s1); align-items: start; }
  .head { font-weight: 600; }
  .muted { color: var(--text-muted); }
  @media (max-width: 40rem) { .cols { grid-template-columns: 1fr; } }
</style>
