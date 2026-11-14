<script lang="ts">
  import { tick } from "svelte";
  import { api, errMessage, errText, type OverviewColumns } from "./api";
  import type { MenuItem } from "./ContextMenu.svelte";
  import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
  import { confirmDialog } from "./ui/confirm.svelte";
  import { undoAction } from "./undo.svelte";
  import { documentDir } from "@tauri-apps/api/path";
  import { plainTabName, samePieces, type TabNameEdit } from "./tabName";
  import OverviewColumnsTab from "./OverviewColumnsTab.svelte";
  import OverviewFiltersTab from "./OverviewFiltersTab.svelte";
  import OverviewAppearanceTab from "./OverviewAppearanceTab.svelte";
  import OverviewTabList from "./OverviewTabList.svelte";
  import Button from "./ui/Button.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import InlineMessage from "./ui/InlineMessage.svelte";
  import MenuButton from "./ui/MenuButton.svelte";
  import ScopeBanner from "./ui/ScopeBanner.svelte";
  import Tabs from "./ui/Tabs.svelte";
  import { toast } from "./ui/toasts.svelte";

  let { userOpen, userId, charId, charOpen, refreshToken, scopeLabel = "", sharedNames = [],
        onUserDirty, onCharDirty, onWindowAdded, onShowAccounts, focusSearch = $bindable(undefined) }:
    { userOpen: boolean; userId: number | null; charId: number | null; charOpen: boolean; refreshToken: number;
      scopeLabel?: string;
      /** The account's other characters, whose window positions a window
       *  removal cannot move. */
      sharedNames?: string[];
      onUserDirty: () => void; onCharDirty: () => void;
      onWindowAdded: (windowId: string) => void; onShowAccounts: () => void;
      /** The shell's Ctrl+F. Overview's only search box is the group filter on
       *  the Filters sub-tab. */
      focusSearch?: () => void } = $props();

  let data = $state<OverviewColumns | null>(null);
  let tabIndex = $state<number | null>(null);
  let error = $state<string | null>(null);
  // Sub-tab selector added in the Columns/Filters/Appearance split; each child
  // stays mounted (hidden via the `hidden` attribute, not `{#if}`) so switching
  // sub-tabs doesn't re-run a child's effects or reset its local state.
  let sub = $state("Columns");

  // Ctrl+F. The box lives on the Filters sub-tab, and the sub-tabs stay MOUNTED
  // and merely `hidden` (above) — so focusing it from Columns would do nothing
  // at all, silently, exactly the way Layout's box failed from a railed
  // inspector. Switch first, wait a tick for `hidden` to come off, then focus.
  let focusFilters = $state<(() => void) | undefined>(undefined);
  focusSearch = () => {
    sub = "Filters";
    void tick().then(() => focusFilters?.());
  };

  async function reload() {
    if (!userOpen) { data = null; return; }
    error = null;
    try {
      data = await api.overviewColumns();
      // Keep the selected tab if it still exists in the (possibly just-switched)
      // file; otherwise fall back to the first tab.
      if (tabIndex === null || !data.tabs.some((t) => t.index === tabIndex)) {
        tabIndex = data.tabs[0]?.index ?? null;
      }
    } catch (e) { error = errMessage(e); }
  }
  // Reload when the slot's file changes (refreshToken bumps on every open/save),
  // not only when userOpen/charId flip — switching between two account files
  // leaves both unchanged and would otherwise show the previous file's overview.
  $effect(() => { void userOpen; void userId; void charId; void refreshToken; reload(); });

  const tab = $derived(data?.tabs.find((t) => t.index === tabIndex) ?? null);
  // The window strip whose tab_indices contains the selected tab (null for an
  // orphan tab that isn't listed under any window).
  const currentWindow = $derived(data?.windows.find((w) => w.tab_indices.includes(tabIndex ?? -1)) ?? null);
  const currentWindowIndex = $derived(currentWindow?.index ?? null);

  // The tab a create just added, which is always the highest index: the backend
  // allocates max+1, and the gap-compaction that follows keeps it last. Diffing
  // the index set against a snapshot taken before the call does NOT survive that
  // compaction — on a table that had gaps, renumbering frees up low indices that
  // were not in the snapshot either, and the first of those wins the diff.
  function newestTab(): number | null {
    const highest = Math.max(...(data?.tabs.map((t) => t.index) ?? []));
    return Number.isFinite(highest) ? highest : null;
  }

  /** Which control group owns a failure. Eight commands, five groups — the
   *  message lands at the control that was operated rather than in a modal that
   *  said "Edit failed" for all of them. */
  type Where = "name" | "windows" | "entry" | "actions" | "move" | "strip" | "pack";
  let editError = $state<{ where: Where; text: string; detail: string } | null>(null);
  const at = (where: Where) => (editError?.where === where ? editError : null);

  /** `sentence` is the app's half of the error grammar — "<thing> wasn't
   *  <verbed>" — and the backend owns the half after the dash. Every caller
   *  writes its own, because what names WHICH thing failed is exactly what one
   *  shared "Edit failed" could never say. */
  async function edit(
    run: () => Promise<OverviewColumns>,
    where: Where,
    sentence: string,
  ): Promise<boolean> {
    editError = null;
    try {
      data = await run();
      return true;
    } catch (e) {
      editError = { where, text: `${sentence} — ${errText(e)}`, detail: errMessage(e) };
      return false;
    }
  }

  async function createTab(name: string, windowIdx: number | null) {
    // `windowIdx` is null in two different situations, and 0 is the right answer
    // to both. A windowless account ignores the argument entirely — the backend
    // refuses to fabricate a mapping and EVE distributes tabs itself. A tab in
    // the "Other" group gets the new tab in window 0: arbitrary, but visible and
    // movable, where refusing would leave the command dead for a selection that
    // looks ordinary.
    if (await edit(() => api.tabCreate(windowIdx ?? 0, name, tabIndex), "entry", "未能保存")) {
      tabIndex = newestTab() ?? tabIndex;
      onUserDirty();
    }
  }

  async function addWindow(name: string) {
    // Add window writes the user grouping AND the char-file geometry, so mark
    // BOTH slots dirty — otherwise saveFile skips the char slot and the new
    // window's position never persists. Then hand the new window's id up so the
    // Layout editor selects it: it defaults offset on top of window 0, so
    // without selecting it it's easy to miss.
    if (!(await edit(() => api.overviewWindowAdd(name, tabIndex), "entry", "窗口未能添加"))) return;
    tabIndex = newestTab() ?? tabIndex;
    onUserDirty();
    onCharDirty();
    const w = data?.windows[data.windows.length - 1];
    if (w) onWindowAdded(w.index === 0 ? "overview" : `overview_${w.index}`);
  }

  // The row editor hands back either styled pieces — Rust writes the markup —
  // or raw markup, written verbatim. An edit that changes nothing is not a
  // write: pieces compare after the normalisation the writer applies, raw
  // markup compares byte for byte, so merely opening the editor on a name
  // never rewrites it.
  async function renameTab(idx: number, change: TabNameEdit) {
    const current = data?.tabs.find((t) => t.index === idx);
    if (!current) return;
    let call: () => Promise<OverviewColumns>;
    if ("pieces" in change) {
      if (current.editable && samePieces(change.pieces, current.pieces)) return;
      call = () => api.tabRenamePieces(idx, change.pieces);
    } else {
      if (change.raw === current.name) return;
      call = () => api.tabRename(idx, change.raw);
    }
    if (await edit(call, "name", "标签页名称未能修改")) onUserDirty();
  }

  // The confirm this replaces said "This can't be undone." It could: the delete
  // mutates the in-memory document, and Discard re-reads both files from disk
  // and reverses it exactly, up to the moment of Save. Thirty lines away in
  // LayoutView the genuinely comparable mutation said the opposite and said it
  // correctly — two dialogs, opposite claims, identical mechanism. That is the
  // worst available outcome, because a user who reads both learns that this
  // app's warnings are decoration.
  //
  // So: no dialog, and a toast carrying the sentence that is actually true.
  async function deleteTab(idx: number) {
    const target = data?.tabs.find((t) => t.index === idx);
    if (!target) return;
    const name = plainTabName(target);
    if (!(await edit(() => api.tabDelete(idx), "actions", "标签页未能删除"))) return;
    toast(`已删除“${name}”。保存以写入磁盘。`, { action: undoAction() });
    tabIndex = data?.tabs[0]?.index ?? null;
    onUserDirty();
    // A delete renumbers the account's tabs, and the backend carries the open
    // character's per-tab column widths and sort setting across with them — so
    // that slot has unsaved work too whenever a character is open.
    if (charOpen) onCharDirty();
  }

  // Also in-memory, also reversed by Discard. The toast is more informative than
  // the dialog it replaces, because it can COUNT the tabs that moved and the
  // dialog could only say that they would.
  async function removeWindow(windowIdx: number) {
    if (!data || data.windows.length <= 1) return;
    const moved = data.windows.find((w) => w.index === windowIdx)?.tab_indices.length ?? 0;
    const shifted = windowIdx < data.windows.length - 1;
    // Edits both slots (grouping + geometry) — mark both dirty so saveFile
    // doesn't skip the char slot.
    if (!(await edit(() => api.overviewWindowRemove(windowIdx), "actions", "窗口未能移除"))) return;
    toast(
      `已移除总览 ${windowIdx + 1}。其 ${moved} 个标签页移到总览 1。`,
      { action: undoAction() },
    );
    if (shifted) warnStalePositions(windowIdx);
    tabIndex = data.tabs[0]?.index ?? null;
    onUserDirty();
    onCharDirty();
  }

  // EVE ties an overview window to its position, and each character keeps its
  // own positions. Removing a window that is not the last moves every later
  // window down one, and only the open character file is re-keyed to match:
  // every other character on the account keeps the old keys, so there each
  // later window opens where the one before it used to be. With no character
  // open, nothing was re-keyed at all.
  function warnStalePositions(windowIdx: number) {
    const who = charOpen ? sharedNames : ["此账户上的每个角色"];
    if (who.length === 0) return;
    toast(
      `总览 ${windowIdx + 2} 及之后的窗口编号都减 1。${who.join("、")} 仍使用旧的窗口位置，游戏中这些窗口会错开一格。把它们移过去，或复制此布局。`,
      { variant: "warn" },
    );
  }

  // Reordering or moving a tab RENUMBERS the tab table — EVE draws a window's
  // tabs in ascending tab index, so that is the only way an order reaches the
  // game. The selected tab's index therefore changes under us, and left alone
  // `tabIndex` would silently come to name a different tab. Re-point it by
  // POSITION instead: whatever the backend now lists where the tab landed is
  // that tab, without this file repeating the backend's renumbering arithmetic.
  function keepSelection(windowIdx: number, pos: number): number | null {
    const strip = data?.windows.find((w) => w.index === windowIdx)?.tab_indices ?? [];
    return strip[pos] ?? tabIndex;
  }

  // Only the tabs of the window that was renumbered move — `renumber_to_strip_order`
  // redistributes that window's own index slots and leaves every other window
  // alone. So a selection outside it needs nothing, and a selection inside it is
  // re-pointed from the position it will hold once the operation lands.
  async function reorder(windowIdx: number, order: number[]) {
    const before = data?.windows.find((w) => w.index === windowIdx)?.tab_indices ?? [];
    // "Actually changed the order" — a drop in place is not an edit, and must
    // not dirty the file or fire the width warning.
    if (order.length === before.length && order.every((v, i) => v === before[i])) return;
    const selectedAt = tabIndex === null ? -1 : order.indexOf(tabIndex);
    if (!(await edit(() => api.tabReorder(windowIdx, order), "strip", "标签页顺序未能调整"))) return;
    if (selectedAt >= 0) tabIndex = keepSelection(windowIdx, selectedAt);
    onUserDirty();
    warnWidthSwap();
  }

  async function moveTab(tabIdx: number, from: number, to: number, pos: number) {
    const dst = data?.windows.find((w) => w.index === to)?.tab_indices ?? [];
    const after = [...dst];
    after.splice(Math.min(pos, after.length), 0, tabIdx);
    const selectedAt = tabIndex === null ? -1 : after.indexOf(tabIndex);
    if (!(await edit(() => api.tabMove(tabIdx, from, to, pos), "move", "标签页未能移动"))) return;
    if (selectedAt >= 0) tabIndex = keepSelection(to, selectedAt);
    onUserDirty();
    warnWidthSwap();
  }

  // Per-tab column widths are keyed (overviewScroll2, tabIndex) in each
  // CHARACTER file, so a renumbering moves them: the open character's now, the
  // account's other characters' when the account is saved. What it cannot reach
  // is a character logged in at the time — EVE rewrites that file at logout, in
  // the old order. With no character open there are no widths on screen, so
  // there is nothing to say.
  function warnWidthSwap() {
    if (!charOpen) return;
    toast("列宽随标签页移动，保存后对此账户的所有角色生效。当时已登录的角色仍保持旧顺序。", { variant: "warn" });
  }

  // A windowless account is normal: EVE's own overview importer deletes the
  // tab-to-window mapping, so anyone who has imported a pack lands here. Writing
  // one REPLACES the client's default distribution and pins every tab into a
  // single window.
  //
  // The dialog is gone, not rewritten. Its text was good, and every word of it
  // is now in the band directly above the button — which was ALREADY on screen
  // saying most of it, one line from the control. That is a deletion rather than
  // a redesign: say what an action costs before it is taken, in the control's
  // own words, and there is nothing left for a dialog after the click to add.
  async function setUpWindowMapping() {
    if (!data || data.windows.length > 0) return;
    const n = data.tabs.length;
    if (!(await edit(() => api.overviewCreateWindowMapping(), "windows", "窗口未能设置"))) return;
    onUserDirty();
    toast(`全部 ${n} 个标签页已位于同一个总览窗口。`, {
      action: undoAction(),
    });
  }

  // A file with no overview container — a fresh account, or a preset pruned to
  // other aspects. The mint is an ordinary in-memory edit: undoable, saved by Save.
  async function createOverview() {
    if (await edit(() => api.overviewCreate(), "pack", "总览设置未能创建")) onUserDirty();
  }

  // Pack import/export is account-wide, so it lives in the view's ⋯ rather than
  // inside one sub-tab. Import marks the slot dirty; the user still saves.
  let packBusy = $state(false);

  // The three account-wide, rare commands. Visible — unlike a right-click — and
  // present-and-disabled rather than absent, so their position never moves.
  function viewMenu(): MenuItem[] {
    const mapped = (data?.windows.length ?? 0) > 0;
    return [
      { label: "导入总览包…", run: importPack, disabled: packBusy, hint: packBusy ? "正在执行总览包操作" : undefined },
      { label: "导出总览包…", run: exportPack, disabled: packBusy, hint: packBusy ? "正在执行总览包操作" : undefined },
      { label: "分配标签页到窗口", run: setUpWindowMapping, disabled: mapped,
        hint: mapped ? "此账户已按窗口分配标签页" : undefined },
    ];
  }

  // EVE's own export lands in Documents/EVE/Overview, so start the picker there.
  // Best-effort: if the path can't be resolved the dialog just opens wherever it
  // last was.
  async function overviewFolder(): Promise<string | undefined> {
    try {
      return `${await documentDir()}EVE/Overview`;
    } catch {
      return undefined;
    }
  }

  async function importPack() {
    const picked = await openDialog({
      multiple: false,
      defaultPath: await overviewFolder(),
      filters: [{ name: "总览包", extensions: ["yaml", "yml"] }],
    });
    if (typeof picked !== "string") return;
    packBusy = true;
    try {
      const summary = await api.packPreview(picked);
      const what = summary.sections
        .map(([name, count]) => (count > 0 ? `${name} (${count})` : name))
        .join(", ");
      const ignored = summary.ignored.length
        ? `\n已忽略，无法识别：${summary.ignored.join(", ")}。`
        : "";
      // Per-tab column overrides are only ever stripped inside apply_tabs,
      // which only runs when the pack defines a non-empty tabSetup section —
      // a preset-only pack never touches them, so don't claim it does.
      const dropsColumns = summary.sections.some(([name, count]) => name === "tabSetup" && count > 0);
      const columnsNote = dropsColumns ? "\n每个标签页的列宽将被丢弃。" : "";
      // The seventh modal surface, and the only one that is NOT a confirmation:
      // it is a PREVIEW of a file the user has not seen the contents of
      // anywhere else, so it cannot become a toast after the fact. It appears
      // only once a pack has been picked.
      const ok = await confirmDialog({
        title: `导入 ${picked.split(/[\\/]/).pop()}？`,
        body: `它将替换：${what}。${columnsNote}${ignored}`,
        detail: picked,
        confirm: "导入总览包",
      });
      if (!ok) return;
      const result = await api.packImport(picked);
      data = result.columns;
      // A pack can replace the tab set wholesale (or the account may have had
      // none at all); if the previously-selected tab no longer exists, fall
      // back to the first tab rather than leaving tabIndex dangling — same
      // rule deleteTab already follows.
      if (!data.tabs.some((t) => t.index === tabIndex)) tabIndex = data.tabs[0]?.index ?? null;
      onUserDirty();
      const w = result.report.warnings;
      // Warnings ride the same toast rather than stacking a second modal on the
      // first. Past three they stop being readable in a toast at all, so it says
      // how many and the detail stays on hover.
      const warnings = w.length === 0 ? "" : w.length > 3 ? `\n${w.length} 条警告。` : `\n${w.join("\n")}`;
      toast(`总览包已导入。保存以写入账户文件。${warnings}`, {
        variant: w.length ? "warn" : "success",
      });
    } catch (e) {
      editError = { where: "pack", text: `总览包未能导入 — ${errText(e)}`, detail: errMessage(e) };
    } finally {
      packBusy = false;
    }
  }

  async function exportPack() {
    const picked = await saveDialog({
      defaultPath: "overview.yaml",
      filters: [{ name: "总览包", extensions: ["yaml"] }],
    });
    if (typeof picked !== "string") return;
    packBusy = true;
    try {
      const report = await api.packExport(picked);
      const n = report.applied.length;
      toast(`已导出 ${n} 个部分到 ${picked.split(/[\\/]/).pop()}。`, {
        variant: "success",
      });
    } catch (e) {
      editError = { where: "pack", text: `总览包未能导出 — ${errText(e)}`, detail: errMessage(e) };
    } finally {
      packBusy = false;
    }
  }
</script>

<!-- ONE child, spanning the work column and the column an inspector would sit
     in. `display: contents` on the root is what lets it reach across: the root
     stops participating in layout and `.work` becomes the grid item.
     A tab's properties are docked under the list that selects it (§13), so
     there is no third column to leave for the shell to fill. -->
<div class="overview-view">
  <div class="work wide">
    <ScopeBanner label={scopeLabel} compact />
    {#if !userOpen && charId !== null}
      <div class="scroll">
        <EmptyState
          title="未配对账户"
          description="总览列保存在账户文件里。">
          {#snippet action()}<Button onclick={onShowAccounts}>配对此角色…</Button>{/snippet}
        </EmptyState>
      </div>
    {:else if !userOpen}
      <div class="scroll">
        <EmptyState
          title="未打开文件"
          description="打开角色或账户文件以编辑总览。" />
      </div>
    {:else if error}
      <div class="scroll"><InlineMessage variant="error">{error}</InlineMessage></div>
    {:else if data?.no_container}
      <div class="scroll">
        <EmptyState
          title="没有总览设置"
          description="此账户文件尚未包含总览设置。创建后可添加标签页，或导入总览包。">
          {#snippet action()}
            <Button onclick={createOverview}>创建总览设置</Button>
            <Button onclick={importPack} disabled={packBusy}>导入总览包…</Button>
          {/snippet}
        </EmptyState>
        {#if at("pack")}
          <InlineMessage variant="error" detail={editError!.detail}>{editError!.text}</InlineMessage>
        {/if}
      </div>
    {:else if data}
      <div class="sub-row">
        {#if data.tabs.length > 0}
          <Tabs
            variant="underline"
            class="subtabs"
            ariaLabel="总览区域"
            tabs={[
              { id: "Columns", label: "列" },
              { id: "Filters", label: "筛选" },
              { id: "Appearance", label: "外观" },
            ]}
            bind:value={sub} />
        {/if}
        <!-- A real button, beside the tabs rather than pinned to the far edge
             of the work column: as a small ghost at the right margin of a wide
             window it was several hundred pixels from anything and read as
             decoration. It is the only home for three account-wide commands. -->
        <MenuButton items={viewMenu} title="总览操作" variant="default" size="md" />
      </div>
      <!-- Pack import and export both live in that menu, so their failures land
           beside the control that opens it. -->
      {#if at("pack") || at("name")}
        <InlineMessage variant="error" detail={editError!.detail}>{editError!.text}</InlineMessage>
      {/if}
      <div class="panes">
        <!-- Just the list. Everything a tab has — its text, its colour, its
             weight, which window it is in, and deleting it — is on the row
             itself, so the properties pane §5 specced has nothing left to hold.
             See §13: the two fields that outlived the move both turned out to
             be duplicates of controls elsewhere. -->
        <div class="side">
          <OverviewTabList
            {data}
            {tabIndex}
            onSelect={(i) => (tabIndex = i)}
            onCreateTab={createTab}
            onAddWindow={addWindow}
            onRemoveWindow={removeWindow}
            onDeleteTab={deleteTab}
            onRenameTab={renameTab}
            parseName={api.tabNameParse}
            formatName={api.tabNameFormat}
            onReorder={reorder}
            onMove={moveTab}
            onSetUpWindowMapping={setUpWindowMapping}
            {editError} />
        </div>
        <div class="scroll">
          {#if data.tabs.length > 0}
            <div hidden={sub !== "Columns"}>
              <OverviewColumnsTab {data} {tabIndex} {charOpen} onChanged={(next) => (data = next)} {onUserDirty} {onCharDirty} />
            </div>
            <div hidden={sub !== "Filters"}>
              <OverviewFiltersTab {data} {tabIndex} onChanged={(next) => (data = next)} {onUserDirty}
                bind:focusSearch={focusFilters} />
            </div>
            <div hidden={sub !== "Appearance"}>
              <OverviewAppearanceTab {data} onChanged={(next) => (data = next)} {onUserDirty} />
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .overview-view { display: contents; }
  /* `.work.wide` — spanning the column an inspector would occupy — is a shell
     rule in app.css, because this view and the shell's own wrappers both set
     it. Nothing about it is local to Overview. */
  .sub-row { display: flex; align-items: flex-end; gap: var(--s3); margin: var(--s2) var(--s3); }
  /* `:global` because the class rides into <Tabs>. This rule used to live in
     OverviewAppearanceTab, which styles a DIFFERENT strip under the same name —
     so this strip's margin came from a child component, and only worked because
     the sub-tabs are hidden rather than unmounted. Declared here now, where the
     strip actually is; same value, no visual change. */
  :global(.subtabs) { margin: var(--s1) 0 var(--s2); }
  /* Bounded side column, unbounded centre — the same reasoning LayoutView's
     grid uses, and the reason the tab list cannot eat the content. Wider than
     a bare list needs, because the side now carries the selected tab's fields
     as well. */
  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(15rem, 20rem) minmax(0, 1fr);
  }
  .side {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--border);
  }
  .side :global(.tablist) { flex: 1 1 auto; min-height: 4rem; }
</style>
