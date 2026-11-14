// The seven things a preset or a batch copy can carry, named once.
//
// There were two label sets for this one seven-item concept — PresetGroup's bare
// nouns and BatchView's fuller phrases — sitting in two files that a user moves
// between while doing the same job. The fuller set wins: "Window layout" alone
// does not tell you the neocom comes with it, and that is exactly the surprise a
// copy has to not spring.
import type { Aspect } from "./api";

export const ASPECT_LABELS: { key: Aspect; label: string }[] = [
  { key: "layout", label: "窗口布局（位置、Neocom、舰船 HUD、战斗机面板、徽章）" },
  { key: "overview", label: "总览（列、标签页、预设）" },
  { key: "autofill", label: "自动补全（记住的文本）" },
  { key: "keybinds", label: "快捷键" },
  { key: "probe_formations", label: "探针阵型（自定义扫描阵型）" },
  { key: "fleet", label: "舰队（广播设置、监视列表颜色、阵型）" },
  { key: "everything", label: "全部内容（两个文件的完整克隆）" },
];
