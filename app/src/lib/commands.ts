// The command registry: one module, one plain array. No registration API, no
// plugin system, no dynamic mutation — the command set is known at build time
// and a `const` array is the whole design.
//
// It has three consumers and they cannot drift, because they ARE it: the app
// menu is `filter(homes app-menu)`, the palette is the same array ranked, and
// the keyboard map is a lookup by id.
//
// STATE is read from the stores; ACTIONS are passed in as `Ctx`. That split is
// deliberate and not the spec's (which passes everything). `subject` is already
// a module store with a `resetSubject()` for tests, so importing it costs
// nothing in testability and saves threading twenty fields through a context
// object — while the actions genuinely belong to the shell, because they move
// `view`, open sheets, and raise pickers this module knows nothing about.
import { subject } from "./subject.svelte";
import { VIEWS, viewAvailable, type View } from "./views";
import { accel } from "./keys";

// What is deliberately NOT here: the per-view commands (Layout's filter
// toggles, Overview's tab actions, the Probes list actions, and the two Presets
// commands). Every one of them already has a visible home in its own view's ⋯
// menu or its own control, and putting them here would mean threading a
// callback out of the component that owns the state for each — for a palette
// entry that duplicates a button one click away. A registry entry whose `run`
// is a no-op would be worse than its absence, because the palette would then
// LIE about what it can do. Discovery rule 1 is satisfied either way: nothing
// in this array is palette-only, and nothing outside it is in the palette.
export type Group = "File" | "Go" | "Search" | "Accounts" | "Help";

/**
 * Where a command is reachable WITHOUT the palette. Never empty — a test
 * enforces it, which is "nothing is palette-only" made mechanical rather than
 * aspirational. It is the rule the other three discovery rules rest on: it
 * means the palette can be missed entirely at zero cost, which is the only
 * honest basis for shipping one.
 */
export type Home =
  | { at: "app-menu" }
  | { at: "control"; where: string }
  | { at: "view-menu"; view: View }
  | { at: "empty-state"; where: string };

export interface Command {
  /** Stable, dot-namespaced. Never rendered. */
  id: string;
  /** Sentence case; the copy standard applies. */
  label: string;
  group: Group;
  /** Extra fuzzy terms: synonyms, EVE's own words, and the OLD label of
   *  anything renamed — so muscle memory keeps working for a release or two.
   *  That is the cheapest possible mitigation for the rename risk. */
  keywords?: string;
  /** Rendered per platform by `accel()`; never a literal in a string. */
  accel?: string;
  /** `true`, or the REASON it is unavailable. One predicate, two consumers: the
   *  menu shows it as the disabled tooltip and the palette as the greyed
   *  subtitle. A disabled command with no reason is a bug — a command that
   *  vanishes teaches nothing, and "Save — nothing has changed" is an answer. */
  enabled: () => true | string;
  /** Length >= 1, enforced by test. */
  homes: Home[];
  run: (ctx: Ctx) => void;
}

/** The actions the shell owns. Everything else is read from the stores. */
export interface Ctx {
  goto: (v: View) => void;
  pickFile: () => void;
  save: () => void;
  discard: () => void;
  showHistory: () => void;
  showAccounts: () => void;
  showBatch: () => void;
  showAbout: () => void;
  showShortcuts: () => void;
  showAiAccess: () => void;
  openPalette: () => void;
  findInView: () => void;
}

const anyOpen = () => subject.slots.char !== null || subject.slots.user !== null;

const goCommand = (v: View, n: number): Command => ({
  id: `go.${v}`,
  label: `前往${VIEWS.find((x) => x.id === v)!.label}`,
  group: "Go",
  accel: accel(String(n)),
  // The SAME predicate the tab strip and the switcher ask, so a tab that is
  // disabled and a command that is disabled can never disagree about why.
  enabled: () => viewAvailable(v) ?? true,
  homes: [{ at: "control", where: "the view tab row" }],
  run: (ctx) => ctx.goto(v),
});

export const COMMANDS: Command[] = [
  // ---- File ---------------------------------------------------------------
  {
    id: "file.open",
    label: "打开文件…",
    group: "File",
    accel: accel("O"),
    keywords: "浏览 磁盘",
    enabled: () => true,
    homes: [{ at: "control", where: "the file list's Open file… button" }, { at: "empty-state", where: "the launch screen" }],
    run: (ctx) => ctx.pickFile(),
  },
  {
    id: "file.save",
    label: "保存",
    group: "File",
    accel: accel("S"),
    enabled: () =>
      subject.canSave
        ? true
        : !anyOpen()
          ? "请先打开角色"
          : "没有任何改动",
    homes: [{ at: "control", where: "the save cluster" }],
    run: (ctx) => ctx.save(),
  },
  {
    id: "file.discard",
    label: "放弃更改",
    group: "File",
    keywords: "还原 重新载入",
    enabled: () => (subject.dirty.char || subject.dirty.user ? true : "没有任何改动"),
    homes: [{ at: "control", where: "the save disclosure" }],
    run: (ctx) => ctx.discard(),
  },
  {
    id: "file.history",
    label: "显示文件历史",
    group: "File",
    accel: accel("H"),
    keywords: "备份 恢复",
    enabled: () => (anyOpen() ? true : "请先打开角色"),
    homes: [{ at: "control", where: "the History button" }],
    run: (ctx) => ctx.showHistory(),
  },
  {
    id: "file.about",
    label: "关于 EVE Settings Editor",
    group: "File",
    enabled: () => true,
    homes: [{ at: "app-menu" }],
    run: (ctx) => ctx.showAbout(),
  },

  // ---- Go -----------------------------------------------------------------
  ...VIEWS.map((v, i) => goCommand(v.id, i + 1)),
  {
    id: "go.accounts",
    label: "账号",
    group: "Go",
    keywords: "配对 解除配对 关联 角色 启动器",
    enabled: () => true,
    homes: [{ at: "app-menu" }],
    run: (ctx) => ctx.showAccounts(),
  },
  {
    id: "go.copySettings",
    label: "复制设置…",
    group: "Go",
    keywords: "批量 克隆 应用多个",
    enabled: () => true,
    homes: [{ at: "app-menu" }],
    run: (ctx) => ctx.showBatch(),
  },

  // ---- Search -------------------------------------------------------------
  {
    id: "palette.open",
    label: "搜索或运行命令",
    group: "Search",
    accel: accel("K"),
    enabled: () => true,
    homes: [{ at: "control", where: "the subject button" }],
    run: (ctx) => ctx.openPalette(),
  },
  {
    id: "view.find",
    label: "在此视图中查找",
    group: "Search",
    accel: accel("F"),
    keywords: "筛选 搜索",
    enabled: () => true,
    homes: [{ at: "control", where: "each view's own search field" }],
    run: (ctx) => ctx.findInView(),
  },

  // ---- Accounts -----------------------------------------------------------
  {
    id: "accounts.pair",
    label: "将此角色与账号配对…",
    group: "Accounts",
    keywords: "关联 绑定",
    enabled: () =>
      subject.charId === null
        ? "请先打开角色"
        : subject.userId !== null
          ? "该角色已配对"
          : true,
    homes: [
      { at: "control", where: "the Accounts sheet" },
      { at: "empty-state", where: "Overview, Autofill, Keybinds and Probes" },
    ],
    run: (ctx) => ctx.showAccounts(),
  },
  // ---- Help ---------------------------------------------------------------
  {
    id: "help.shortcuts",
    label: "键盘快捷键",
    group: "Help",
    accel: accel("/"),
    keywords: "按键 快捷键 绑定",
    enabled: () => true,
    homes: [{ at: "app-menu" }],
    run: (ctx) => ctx.showShortcuts(),
  },
  {
    id: "help.aiAccess",
    label: "AI 访问…",
    group: "Help",
    keywords: "mcp claude 助手 ai",
    enabled: () => true,
    homes: [{ at: "app-menu" }],
    run: (ctx) => ctx.showAiAccess(),
  },
];

/** By id, for the keyboard map. `undefined` for an id that is not a command,
 *  which is a programming error rather than a runtime state. */
export const byId = (id: string): Command | undefined => COMMANDS.find((c) => c.id === id);

/** The haystack `fuzzy.score` matches its `extra` against. Group is in it, which
 *  is what makes typing `overv` surface every Overview command. */
export const haystack = (c: Command): string => `${c.keywords ?? ""} ${c.group}`;
