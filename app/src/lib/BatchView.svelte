<script lang="ts">
  import { untrack } from "svelte";
  import { api, errMessage, type Profile, type Aspect, type SetupPlan, type BatchTargetResult, type BatchSource, type PresetInfo, type SlotMergePlan } from "./api";
  import { byResolvedName, resolvedName } from "./filesort.svelte";
  import { primaryProfileDir, profileLabels } from "./profiles";
  import { accountsStore, loadRoster } from "./accounts.svelte";
  import { allPresets, loadPresets, summarise } from "./presetLibrary.svelte";
  import { ASPECT_LABELS } from "./aspects";
  import Button from "./ui/Button.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import Field from "./ui/Field.svelte";
  import InlineMessage from "./ui/InlineMessage.svelte";
  import Sheet from "./ui/Sheet.svelte";

  // Two paths, not one. `openPath` was the tab-derived active slot, so which
  // editor tab happened to be selected decided whether the source seeded at all
  // — and the open-file warning could only ever check one of the two documents.
  let {
    openCharPath,
    openUserPath,
    onClose,
    onApplied,
  }: {
    openCharPath: string | null;
    openUserPath: string | null;
    onClose: () => void;
    /** Every path this run actually wrote, so the shell can re-read the ones it
     *  has open. Called only on a successful apply. */
    onApplied?: (written: string[]) => void;
  } = $props();

  loadRoster();
  loadPresets();

  // Character (char) files only — the source and every target is a character.
  let profiles = $state<Profile[]>([]);
  api.discover().then((p) => (profiles = p)).catch(() => {});
  const chars = $derived(
    profiles.flatMap((p) =>
      p.files
        .filter((f) => f.kind === "char")
        .map((f) => ({ path: f.path, file_name: f.file_name, id: f.id, kind: f.kind, dir: p.dir })),
    ),
  );

  const folders = $derived.by(() => {
    const labels = profileLabels(profiles);
    return profiles
      .filter((p) => chars.some((c) => c.dir === p.dir))
      .map((p) => ({ dir: p.dir, label: labels.get(p.dir)! }));
  });

  let allowOtherFolders = $state(false);
  let folderPick = $state<string | null>(null);
  const autoFolder = $derived(
    chars.find((c) => c.path === sourcePath)?.dir ?? primaryProfileDir(profiles),
  );
  const folder = $derived(folderPick ?? autoFolder);

  let sourcePath = $state<string | null>(
    untrack(() => (openCharPath && openCharPath.includes("core_char_") ? openCharPath : null)),
  );

  function pickFolder(dir: string) {
    folderPick = dir;
    sourcePath = null;
  }

  // The batch source is either a character (as before) or a saved preset. A
  // preset belongs to no profile folder, so it borrows the Profile dropdown's
  // `folder` as its anchor — the folder whose characters populate the target list.
  //
  // A third source kind sidesteps both: "a file", copied byte-for-byte onto
  // other files of the same kind. No aspects and no pairing — the plain copy
  // the character-centric flow cannot express, because every aspect it offers
  // writes the account file and so needs to know which account that is.
  let sourceKind = $state<"character" | "preset" | "file" | "racks">("character");
  let presetDir = $state<string | null>(null);
  const preset = $derived<PresetInfo | null>(allPresets().find((p) => p.dir === presetDir) ?? null);

  let sourceFile = $state<string | null>(null);
  const fileMode = $derived(sourceKind === "file");
  const racksMode = $derived(sourceKind === "racks");
  // Every char AND user file, backups included: this mode addresses files by
  // path, so `core_char_123 - old.dat` is a legitimate pick at either end.
  const filesInScope = $derived(
    profiles
      .filter((p) => allowOtherFolders || p.dir === folder)
      .flatMap((p) => p.files.filter((f) => f.kind !== "other").map((f) => ({ ...f, dir: p.dir })))
      .sort(byResolvedName),
  );
  // Searched across every profile, not just `filesInScope`: toggling "show other
  // folders" must not invalidate a source already picked.
  const sourceFileKind = $derived(
    profiles.flatMap((p) => p.files).find((f) => f.path === sourceFile)?.kind ?? null,
  );
  const fileTargets = $derived(
    filesInScope.filter((f) => f.kind === sourceFileKind && f.path !== sourceFile),
  );

  // What the chosen source can offer. A preset offers only what it holds, so
  // Autofill cannot be ticked on a preset that has none.
  const offered = $derived<Aspect[]>(
    sourceKind === "preset"
      ? (preset?.aspects ?? [])
      : ASPECT_LABELS.map((a) => a.key),
  );

  const batchSource = $derived<BatchSource | null>(
    sourceKind === "character"
      ? (sourcePath ? { kind: "character", path: sourcePath } : null)
      : (presetDir ? { kind: "preset", dir: presetDir, anchor_dir: folder ?? "" } : null),
  );

  // Aspects. "Everything" is exclusive. Labels are shared with PresetGroup —
  // one seven-item concept had two label sets in two files a user moves between
  // while doing the same job.
  const ASPECTS: { key: Aspect; label: string; account: boolean }[] = ASPECT_LABELS.map((a) => ({
    ...a,
    account: true,
  }));
  let selected = $state<Set<Aspect>>(new Set());
  const everything = $derived(selected.has("everything"));
  const anyAccountAspect = $derived([...selected].some((a) => ASPECTS.find((x) => x.key === a)?.account));
  function toggleAspect(a: Aspect) {
    const next = new Set(selected);
    if (a === "everything") {
      next.has(a) ? next.delete(a) : (next.clear(), next.add(a));
    } else {
      next.delete("everything");
      next.has(a) ? next.delete(a) : next.add(a);
    }
    selected = next;
  }

  // Which char ids are paired (member of some account) — unpaired chars can't
  // receive an account aspect.
  const pairedIds = $derived(
    new Set(accountsStore.roster.accounts.flatMap((acc) => acc.characters)),
  );

  // The source dropdown lists every character in the folder (the current source
  // included), ordered like the sidebar.
  const charsInScope = $derived(
    chars
      .filter((c) => allowOtherFolders || c.dir === folder)
      .sort((a, b) =>
        byResolvedName(
          { kind: "char", id: a.id, file_name: a.file_name },
          { kind: "char", id: b.id, file_name: b.file_name },
        ),
      ),
  );
  // The rack merge reads and writes the same ticked list: a ticked account file
  // contributes its ships and receives everyone's; an unticked one is untouched.
  // Its own folder only — the merge is a per-profile operation.
  const accountFiles = $derived(
    profiles
      .filter((p) => p.dir === folder)
      .flatMap((p) => p.files.filter((f) => f.kind === "user" && f.id !== null).map((f) => ({ ...f, dir: p.dir })))
      .sort(byResolvedName),
  );
  const candidates = $derived(
    racksMode
      ? accountFiles
      : fileMode
      ? fileTargets
      // A character cannot be its own copy target — but ONLY when it is the
      // source. `sourcePath` is seeded from the open file and never cleared on
      // switching to a preset source, so filtering on it directly kept the open
      // character out of the list for the rest of the session.
      : charsInScope.filter((c) => !(batchSource?.kind === "character" && c.path === batchSource.path)),
  );
  let selectedTargets = $state<Set<string>>(new Set());
  function toggleTarget(path: string) {
    const next = new Set(selectedTargets);
    next.has(path) ? next.delete(path) : next.add(path);
    selectedTargets = next;
  }
  // Pairing only gates the character flow: a file copy writes the file you
  // picked, so it has no account to look up.
  const targetDisabled = (id: number | null) =>
    !fileMode && !racksMode && anyAccountAspect && !(id != null && pairedIds.has(id));

  // The targets actually sent to the backend: the selected set minus any row the
  // current aspect selection excludes (an unpaired character under an account
  // aspect). The backend independently excludes them too, but filtering here
  // keeps the UI honest — a disabled row never counts as a real target, and its
  // selection is preserved so it re-includes if the aspect choice changes back.
  const effectiveTargets = $derived(
    fileMode || racksMode
      ? [...selectedTargets]
      : [...selectedTargets].filter((p) => {
          const c = chars.find((x) => x.path === p);
          return c ? !targetDisabled(c.id) : false;
        }),
  );

  // Applying onto the open document writes behind it: the in-memory copy goes
  // stale and the only thing that notices is the save-time on-disk check, two
  // steps later. Warn at the point of decision instead. Dirty state doesn't
  // matter — the on-screen copy is out of date either way.
  //

  function selectAllTargets() {
    const next = new Set(selectedTargets);
    for (const c of candidates) if (!targetDisabled(c.id)) next.add(c.path);
    selectedTargets = next;
  }
  function clearTargets() {
    selectedTargets = new Set();
  }

  // Short names for the account-write warning, in the order checked in ASPECTS
  // (excluding "everything", which is reported as a full copy instead).
  const changedAspectNames = $derived(
    ASPECTS.filter((a) => a.account && a.key !== "everything" && selected.has(a.key)).map((a) => a.label),
  );
  // Window layout is the only aspect that can REMOVE a value: a HUD field the
  // source leaves at EVE's default is deleted from the target so it falls back
  // to that same default. Every other aspect only ever overwrites.
  const resetsToDefaults = $derived(selected.has("layout"));

  const nameOf = (kind: string, id: number | null, fileName: string) =>
    id == null ? fileName : (resolvedName(kind, id) ?? `${kind === "user" ? "账号" : "角色"} ${id}`);
  const nameOfChar = (id: number | null, fileName: string) => nameOf("char", id, fileName);

  const accountLabel = (id: number) => {
    const alias = resolvedName("user", id);
    return alias ? `${alias} (${id})` : `${id}`;
  };
  const folderLabelOf = (dir: string) => profileLabels(profiles).get(dir) ?? dir;

  // Reset op + targets when the source changes — including a switch between
  // "character" and "preset", not just a different pick within one kind.
  //
  // `folderPick`, not `folder`: the derived one starts null and gains a value
  // when `api.discover()` resolves, which is not a user action, and an aspect
  // ticked in that window (the source seeds from the open file synchronously,
  // so the checkboxes can render before discover lands) was silently cleared.
  // Nothing is lost by watching the pick instead — `pickFolder` also nulls
  // `sourcePath`, which triggers this effect anyway.
  $effect(() => {
    sourcePath;
    presetDir;
    sourceFile;
    sourceKind;
    folderPick;
    selected = new Set();
    selectedTargets = new Set();
  });

  // Default: every account file ticked. Re-ticks when the folder changes or
  // discovery lands, which is when the list itself changes.
  // Keyed on the set of paths, not the sorted list: a roster or alias load only
  // reorders it and must not undo the user's unticks.
  const accountKey = $derived(accountFiles.map((f) => f.path).sort().join("\n"));
  $effect(() => {
    void accountKey;
    if (racksMode) untrack(() => (selectedTargets = new Set(accountFiles.map((f) => f.path))));
  });

  let mergePlan = $state<SlotMergePlan | null>(null);
  let mergeError = $state<string | null>(null);
  let mergePending = $state(false);
  let mergeSeq = 0;
  $effect(() => {
    const files = effectiveTargets;
    const seq = ++mergeSeq;
    // Cleared before the await: the shown plan must always describe the current ticks.
    mergePlan = null;
    mergeError = null;
    mergePending = false;
    if (!racksMode || files.length === 0) return;
    mergePending = true;
    api.slotOrderMergePreview(files)
      .then((p) => { if (seq === mergeSeq) { mergePlan = p; mergePending = false; } })
      .catch((e) => { if (seq === mergeSeq) { mergeError = errMessage(e); mergePending = false; } });
  });
  const mergeWrites = $derived(mergePlan?.files.filter((f) => !f.error && f.gained + f.changed > 0).length ?? 0);
  const mergeReason = $derived(
    effectiveTargets.length === 0 ? "至少勾选一个账号文件"
    : mergePending ? "正在计算将发生的变化…"
    : mergeError ? "合并预览失败"
    : "无可合并 — 每个勾选的账号都已拥有全部舰船",
  );
  const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;
  const dirOf = (p: string) => p.slice(0, p.length - fileName(p).length - 1);

  // Preview from the backend whenever source/aspects/targets settle. Guarded
  // by a request token so a slow, stale response can't clobber a newer plan.
  let plan = $state<SetupPlan | null>(null);

  // Every path this run will write, character targets AND the account writes the
  // backend plans, intersected with BOTH open slots. The old check compared one
  // tab-derived path against the character targets only, so it missed two real
  // cases: the open ACCOUNT file being rewritten (a keybinds copy onto a paired
  // sibling writes it, and it may be the very one open), and the open character
  // file whenever the user sat on a user-scoped tab.
  const willWrite = $derived(
    fileMode || racksMode
      ? effectiveTargets
      : [...effectiveTargets, ...(plan?.account_writes ?? []).map((w) => w.path)],
  );
  const openTargets = $derived(
    ([openCharPath, openUserPath] as const).filter(
      (p): p is string => p !== null && willWrite.includes(p),
    ),
  );
  // Named, not counted: "one target" does not say which file is about to go
  // stale behind the sheet.
  const openTargetNames = $derived(
    openTargets.map((p) => {
      if (p === openUserPath) {
        const m = p.match(/core_user_(\d+)\.dat$/);
        return m ? `${accountLabel(Number(m[1]))} 账号文件` : "已打开的账号文件";
      }
      const c = chars.find((x) => x.path === p);
      return c ? nameOfChar(c.id, c.file_name) : "已打开的角色文件";
    }),
  );
  let previewSeq = 0;
  $effect(() => {
    const src = batchSource;
    const asp = [...selected];
    const tgts = effectiveTargets;
    const allow = allowOtherFolders;
    // A file copy has no plan to fetch: the write list is exactly the ticked files.
    if (fileMode || racksMode || !src || asp.length === 0 || tgts.length === 0) { plan = null; return; }
    const seq = ++previewSeq;
    api.setupPreview(src, tgts, asp as Aspect[], allow)
      .then((p) => { if (seq === previewSeq) plan = p; })
      .catch(() => { if (seq === previewSeq) plan = null; });
  });

  let busy = $state(false);
  let error = $state<string | null>(null);
  let results = $state<BatchTargetResult[] | null>(null);
  const canApply = $derived(
    racksMode
      ? mergeWrites > 0 && effectiveTargets.length > 0 && !busy
      : fileMode
      ? !!sourceFile && effectiveTargets.length > 0 && !busy
      : !!batchSource && selected.size > 0 && effectiveTargets.length > 0 && !busy &&
        !!plan && !plan.source_error && (plan.char_writes.length + plan.account_writes.length > 0),
  );

  async function apply() {
    busy = true; error = null; results = null;
    try {
      if (racksMode) {
        results = await api.slotOrderMergeApply(effectiveTargets);
      } else if (fileMode) {
        if (!sourceFile) return;
        results = await api.copyFiles(sourceFile, effectiveTargets);
      } else {
        if (!batchSource) return;
        results = await api.setupApply(batchSource, effectiveTargets, [...selected] as Aspect[], allowOtherFolders);
      }
      // Only what actually landed. The shell re-reads any slot in this list that
      // is open and clean, so every projection-based view refreshes through the
      // `savedAt` token it already watches. Not called when apply throws.
      onApplied?.(results.filter((r) => r.ok && r.backup_path !== null).map((r) => r.path));
    } catch (e) {
      error = errMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<!-- `wide`, because a target row carries three pieces — name, filename, and a
     folder label when it is out of folder — and the plan preview's account
     warnings list collateral characters by name. Cramping those is how a
     destructive screen gets misread. The title stays fixed so the sheet's
     identity does not change under the user when they click a source radio; what
     varies moves to the subtitle, verbatim. -->
<Sheet
  title="复制设置"
  subtitle={racksMode ? "跨账号合并舰船槽位布局" : fileMode ? "将一个文件复制到其他文件" : "将设置复制到其他角色"}
  titled
  placement="work"
  onclose={onClose}
  data-testid="batch-backdrop">
<div class="batch">

  <section>
    <Field
      kind="select"
      id="folder"
      label="配置档"
      layout="column"
      value={folder}
      onchange={(e) => pickFolder((e.currentTarget as HTMLSelectElement).value)}
      options={folders.map((f) => ({ value: f.dir, label: f.label }))} />

    <div class="head">来源</div>
    <Field kind="radio" name="sourceKind" bind:value={sourceKind} radioValue="character" label="角色" />
    <Field kind="radio" name="sourceKind" bind:value={sourceKind} radioValue="preset" label="预设" />
    <Field kind="radio" name="sourceKind" bind:value={sourceKind} radioValue="file" label="文件，原样复制" />
    <Field kind="radio" name="sourceKind" bind:value={sourceKind} radioValue="racks" label="舰船槽位布局，跨配置档合并" />

    {#if sourceKind === "character"}
      <Field
        kind="select"
        id="src"
        label="来源角色"
        layout="column"
        bind:value={sourcePath}
        options={[
          { value: null, label: "选择一个角色…", disabled: true },
          ...charsInScope.map((c) => ({
            value: c.path,
            label: `${nameOfChar(c.id, c.file_name)} — ${c.file_name}`,
          })),
        ]} />
    {:else if sourceKind === "preset"}
      <Field
        kind="select"
        id="srcpreset"
        label="来源预设"
        layout="column"
        bind:value={presetDir}
        options={[
          { value: null, label: "选择一个预设…", disabled: true },
          ...allPresets()
            .filter((p) => p.error === null)
            .map((p) => ({ value: p.dir, label: `${p.name} — ${summarise(p)}` })),
        ]} />
      {#if allPresets().length === 0}
        <EmptyState title="尚无预设 — 先从侧边栏保存一个。" />
      {/if}
    {:else if sourceKind === "racks"}
      <InlineMessage>
        任何勾选账号上布置的所有舰船都会同步到全部账号。若两个账号对同一艘舰船布置不同，
        以最后保存的账号文件为准。
      </InlineMessage>
    {:else}
      <Field
        kind="select"
        id="srcfile"
        label="来源文件"
        layout="column"
        bind:value={sourceFile}
        options={[
          { value: null, label: "选择一个文件…", disabled: true },
          ...filesInScope.map((f) => ({
            value: f.path,
            label: `${nameOf(f.kind, f.id, f.file_name)} — ${f.file_name}`,
          })),
        ]} />
      <InlineMessage>
        整个文件会复制到你勾选的每个文件 — 角色文件复制到角色文件，账号文件复制到账号文件。
        无需配对。
      </InlineMessage>
    {/if}
  </section>

  {#if racksMode || (fileMode ? !!sourceFile : !!batchSource)}
    {#if !fileMode && !racksMode}
      <section>
        <div class="head">复制内容</div>
        {#each ASPECTS.filter((a) => offered.includes(a.key)) as a}
          <Field
            kind="checkbox"
            label={a.label}
            value={selected.has(a.key)}
            disabled={everything && a.key !== "everything"}
            disabledReason="全部内容已涵盖此项"
            onchange={() => toggleAspect(a.key)} />
        {/each}
      </section>
    {/if}

    <section>
      <div class="head">
        {racksMode ? "账号文件" : fileMode ? "复制到" : "目标角色"}
        <!-- All / None. `Clear` here meant "untick", which collided with
             "Clear list" and "Clear all remembered text" two views away. -->
        <Button variant="ghost" size="sm" class="linkbtn" type="button" onclick={selectAllTargets}>
          全选
        </Button>
        <Button variant="ghost" size="sm" class="linkbtn" type="button" onclick={clearTargets}>全不选</Button>
        {#if !racksMode}<Field kind="checkbox" label="显示其他文件夹" bind:value={allowOtherFolders} />{/if}
      </div>
      {#if candidates.length === 0}
        <EmptyState
          title={racksMode ? "此配置档中尚无账号文件。" : fileMode ? "未找到同类的其他文件。" : "未找到其他角色文件。"} />
      {:else}
        <!-- The row stays a hand-written wrapping label rather than a Field: its
             caption is three spans, not a string, and BatchView.spec reads the
             whole label's text to check what a disabled target says. -->
        {#each candidates as c}
          <label class:disabled={targetDisabled(c.id)}>
            <input type="checkbox" checked={selectedTargets.has(c.path) && !targetDisabled(c.id)}
              disabled={targetDisabled(c.id)}
              title={targetDisabled(c.id) ? "请先在账号视图中配对这个角色" : undefined}
              onchange={() => toggleTarget(c.path)} />
            {nameOf(c.kind, c.id, c.file_name)}
            <span class="muted">{c.file_name}{c.dir === folder ? "" : ` · ${folderLabelOf(c.dir)}`}</span>
            {#if targetDisabled(c.id)}<span class="muted"> — 在账号视图中配对以纳入</span>{/if}
          </label>
        {/each}
      {/if}
    </section>

    <!-- Applies to both modes, so it sits outside the plan: a file copy fetches
         no plan, and in the character flow this warns before the plan lands. -->
    {#if openTargets.length > 0}
      <section class="preview">
        <!-- Names the document rather than saying "one target". With the editor
             standing behind the sheet, the file it is talking about is right
             there — warning about a document behind a curtain while holding the
             curtain shut was the wrong way round. -->
        <InlineMessage variant="warn">⚠ 这将重写 {openTargetNames.join("、")}，
          该文件已在本面板后方的编辑器中打开。之后屏幕上的
          {openTargetNames.length === 1 ? "这份副本" : "这些副本"}将会过期。</InlineMessage>
      </section>
    {/if}

    {#if racksMode}
      {#if mergeError}
        <section class="preview"><InlineMessage variant="error">{mergeError}</InlineMessage></section>
      {/if}
      {#if mergePlan}
        <section class="preview">
          <p>将写入 {mergeWrites} 个文件 — 每个文件都会先备份。</p>
          {#each mergePlan.files as f}
            <p class:muted={!f.error && f.gained + f.changed === 0}>
              {f.account_id !== null ? `账号 ${accountLabel(f.account_id)}` : fileName(f.path)}:
              {#if f.error}{f.error}
              {:else if f.gained + f.changed === 0}无变化
              {:else}新增 {f.gained} 艘舰船{f.gained === 1 ? "" : ""}，{f.changed} 已更改{/if}
            </p>
          {/each}
          {#each mergePlan.conflicts as c}
            <InlineMessage variant="warn">⚠ 舰船 {c.ship_id}：保留 {fileName(c.kept_from)}（最新）的布局，并在 {c.overridden.map(fileName).join(", ")} 中替换它。</InlineMessage>
          {/each}
        </section>
      {/if}
    {:else if fileMode}
      {#if effectiveTargets.length > 0}
        <section class="preview">
          <p>将写入 {effectiveTargets.length} 个文件 — 每个文件都会先备份。</p>
          <InlineMessage variant="warn">⚠ 每个目标都会被整体替换 — 它所包含的全部设置，
            包括本编辑器不显示的设置。{#if sourceFileKind === "user"} 账号文件承载着该账号上每个角色的设置。{/if}</InlineMessage>
        </section>
      {/if}
    {:else if plan}
      <section class="preview">
        {#if plan.source_error}
          <InlineMessage variant="error">{plan.source_error}</InlineMessage>
        {:else}
          <p>将写入 {plan.char_writes.length + plan.account_writes.length} 个文件 — 每个文件都会先备份。</p>
          {#each plan.char_writes.filter((w) => w.resolution_mismatch) as w}
            <InlineMessage variant="warn">⚠ {nameOfChar(w.char_id, "")}：屏幕分辨率与来源不同 — 复制的窗口可能落到屏幕外。</InlineMessage>
          {/each}
          {#each plan.account_writes as w}
            <InlineMessage variant="warn">⚠ {w.full_copy ? "整个账号设置已替换" : `${changedAspectNames.join(" / ")} 已更改${resetsToDefaults ? " — 其中来源保持为 EVE 默认值的项，会在这里重置为该默认值，而不是保持原样" : ""}`}（账号 {accountLabel(w.user_id)}{dirOf(w.path) === folder ? "" : `，位于 ${folderLabelOf(dirOf(w.path))}`}{#if w.collateral_char_ids.length > 0} — 还会更改：{w.collateral_char_ids.map((id) => nameOfChar(id, `角色 ${id}`)).join(", ")}{/if}）。该账号上尚未配对的其他角色同样会受影响 — 在账号视图中为它们配对，即可按名称查看。</InlineMessage>
          {/each}
          {#each plan.excluded as ex}
            <p class="muted">已排除 {nameOfChar(ex.char_id, `角色 ${ex.char_id}`)} — {ex.reason}</p>
          {/each}
        {/if}
      </section>
    {/if}

    <section>
      <Button
        variant="primary"
        disabled={!canApply}
        disabledReason={busy ? "已有复制正在进行" : racksMode ? mergeReason : "请选择来源和至少一个目标"}
        onclick={apply}>{busy ? (racksMode ? "正在合并…" : "正在复制…") : racksMode ? "合并" : "复制"}</Button>
      {#if error}<InlineMessage variant="error">{error}</InlineMessage>{/if}
    </section>

    {#if results}
      <section class="results">
        <div class="head">结果</div>
        {#each results as r}
          <div class:ok={r.ok} class:fail={!r.ok}>
            {r.ok ? "✓" : "✗"} {r.path.split(/[\\/]/).pop()}
            {#if r.error}<span class="muted"> — {r.error}</span>{/if}
          </div>
        {/each}
      </section>
    {/if}
  {/if}
</div>
</Sheet>

<style>
  /* The select/option and accent-color rules are gone — Field owns them. The
     .warn/.err/.ok colour trio is gone too: those were three more spellings of
     --warn/--danger/--ok, and the paragraphs they coloured are InlineMessages
     now, which carry the meaning in a rail rather than in the body text. */
  /* The Sheet owns the padding and the scrolling. The column is wider than the
     46rem it capped itself at: a target row carries a name, a filename and
     sometimes a folder label, and the account warnings list collateral
     characters by name. Still bounded, so a sentence never runs the full width
     of a 2560px screen. */
  .batch { max-width: 60rem; }
  section { margin: var(--s3) 0; }
  /* BatchView.spec finds each section through this class. */
  .head { font-weight: 600; margin-bottom: var(--s1); display: flex; gap: var(--s4); align-items: baseline; }
  label { display: block; padding: 0; }
  label.disabled { opacity: var(--o-disabled); }
  .batch :global(.linkbtn) { color: var(--accent); padding: 0; }
  .batch :global(.linkbtn:hover) { text-decoration: underline; background: none; }
  .muted { color: var(--text-muted); }
  .preview p { margin: var(--s1) 0; }
  .fail { color: var(--danger); }
  .ok { color: var(--ok); }
</style>
