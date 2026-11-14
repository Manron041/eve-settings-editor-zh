[English](settings-field-reference.md) | [简体中文](settings-field-reference.zh-CN.md)

# EVE 设置字段参考

对角色与账号设置文件中**每一个字段**的系统性清点，源自语料而非猜测，
以及这些结论对于我们可能构建的编辑器的意义。

`format-notes.md` 的姊妹篇：该文档描述*线上格式*以及我们通过实验建立的
映射；本文描述*内容*——完整的键集合、每个键保存什么、键之间的关系，
以及哪些键已被应用覆盖。

下文不出现任何角色名、账号名或真实数字 id。示例中的每个 id 都是合成
占位符（`<charID>`、`<itemID>`、`<channelGUID>`、`<stationID>`、
`<typeID>`、`<presetName>`）。计数与形态均为实测。

---

## 1. 方法

基于最新的语料快照（`2026-07-22T120910Z_states-after`）测量：

| | 文件数 | 其中位于活动 `settings_Default` 目录内 |
|---|---|---|
| `core_char_<id>.dat` | 384 | 109 |
| `core_user_<id>.dat` | 175 | 54 |

一个一次性的 Rust 工具（基于 `blue-marshal` 构建，未纳入仓库）解码每个
文件，解析所有 `Shared`/`Ref` 间接引用，解开 `(FILETIME, value)` 叶子
包装，并按键路径聚合：多少文件包含该键、其值类型、容器长度、字典键类型
以及样本值。字典键被分为**设置键**（出现在 ≥ 2 % 的文件中——单独成条）
与**实例键**（逐项/逐窗口/逐会话状态——折叠为单个 `*` 条目）。两遍处理：
第 1 遍学习键频率，第 2 遍在应用折叠后输出。

阅读这些数字时值得了解的注意事项：

- 语料来自一位玩家的机器。出现计数显示一个键有多*普遍*，而不是某项
  设置有多流行。313/384 的键表示"客户端为近期玩过的几乎所有角色都
  写入过它"；缺失的约 70 个是多年前最后写入的陈旧文件。
- 快照包含该配置档自身的 `settings_Default - backup` / `- before X`
  目录，因此跨越了从约 2020 年到 2026-07-22 的客户端世代。这是特性——
  正是由此识别出遗留键——但"活动"列才是判断"当前客户端是否仍这样做"
  时应信任的列。
- 键的缺失几乎从不表示"关闭"。它表示 *EVE 从未为此角色写入过它*，
  客户端回退到内置默认值。这对 `stateColors` 和
  `shipuialignleftoffset` 已是既定规则；在整个文件范围内都成立。

---

## 2. 作用域：三个，而非两个

| 作用域 | 文件 | 写入时机 | 编辑它影响 |
|---|---|---|---|
| **机器** | `core_public__.yaml`、`prefs.ini` | 客户端关闭时 | 此 PC/安装上的每个账号与角色 |
| **账号** | `core_user_<accountID>.dat` | 登出时 | 该账号上的每个角色 |
| **角色** | `core_char_<charID>.dat` | 登出时 | 单个角色 |

应用目前只建模下面两层。机器作用域是真实的第三层，承载图形/分辨率/
主音量设置，且完全不是 marshal——它是使用同一 `(FILETIME, value)`
约定的 YAML（见 §6）。

---

## 3. 读取约定（以及陷阱）

1. **`(FILETIME, value)` 叶子包装。** 大多数设置叶子是一个二元组，
   其第一个元素是持有 Windows FILETIME 的 `Long`。在
   `format-notes.md` 中确立；此处确认为普遍成立。

2. **时间戳本身经常是 `Ref` 或 `Shared`。** 相同的时间戳会在文件内
   去重，因此包装的元素 0 往往是 `Ref(slot)`，指向别处定义的
   `Long`——*而不是*裸 `Long`。任何直接匹配 `Value::Long` 的
   "这是带时间戳的叶子吗"测试都会遗漏很大一部分真实叶子，并把它们
   报告为普通二元组。先通过共享表解析。（清单工具的第一版就吃了这个
   亏；本文中的每个值形态都是解析之后的。）

3. **字典键也经常是 `Ref`**，包括*元组键内部*——
   `(Ref→b"overviewScroll2", 3)` 是总览宽度键的正常落盘形态。按键的
   解析值比较键，绝不按原始节点比较。`format-notes.md` 已记录账号文件
   根 `ui` 节键的这一点；这是普遍的。

4. **字典键不总是字节串。** 语料中观察到的键类型：`bytes`、`str`、
   `int`、`tuple`（上述任意类型的嵌套）、`bool`，以及——在账号 `ui`
   节中，140/175 个文件里——字面 `None` 键。任何遍历这些字典的代码
   都必须能处理全部类型并无损往返。

5. **值的类型在客户端世代间不稳定。** 同一键可能在一个文件中是
   `Bool`，在另一个中是 `Int 0/1`（`hideCorpTicker`、
   `FMBQsearchTitles`、`alliance`、`public`、
   `contracts_search_expander_advanced`、`updateOnBossChange`……），
   或 `Bytes` 对 `Str`（`market_searchText`、
   `charSheetSelectedPanel`），或 `Int` 对 `Long`
   （`lastSeenNotificationId`）。硬匹配单一变体的读取器会在较旧文件上
   静默地什么都投射不出来。

6. **空节是正常的。** 若干顶层节*始终*是空字典——它们是客户端保留但
   此语料从未填充的命名空间（§4.1、§5.1）。

---

## 4. 角色文件 — `core_char_<charID>.dat`

根是一个包含 **14 个节**的字典（每个文件出现 9–13 个）。

### 4.1 节映射

| 节 | 文件数 | 内容 |
|---|---|---|
| `windows` | 384/384 | 窗口几何、逐窗口标志字典、堆栈、飞船 HUD 偏移、配色主题 |
| `ui` | 384/384 | 296 个不同键（171 个常见）——通用的逐角色 UI 状态容器 |
| `notifications` | 384/384 | 通知徽章位置 + 最近查看记录 |
| `dockPanels` | 370/384 | 5+ 个可停靠面板的几何（地图、Agency、技能规划器……） |
| `notepad` | 384/384 | 仅 `activeNote` |
| `autorepeat` | 384/384 | 逐模块自动重复，按物品 id 键控 |
| `autoreload` | 384/384 | 逐模块自动重装，按物品 id 键控 |
| `unseenInventoryItems` | 80/384 | 逐容器"新物品"集合 |
| `seenInventoryItems` | 14/384 | 同上，已见的一半 |
| `shiptheme` | 203/384 | **始终为空** |
| `enableWindowBlur` | 203/384 | **始终为空** |
| `generic` | 384/384 | **始终为空** |
| `inbox` | 384/384 | **始终为空** |
| `zaction` | 384/384 | **始终为空** |

### 4.2 `windows` — 19 个键

按窗口 id 键控的字典（`openWindows`、`minimizedWindows`……）已在
`format-notes.md` 中覆盖。该文档未列出的：

| 键 | 文件数 | 形态 | 含义 |
|---|---|---|---|
| `__version__` | 384/384 | `Int` = 1 | windows 节的 schema 版本 |
| `__usercopy__` | 384/384 | `Bool` = true | 将该节标记为用户复制 |
| `__clear_stored_compact_window_settings_that_match_the_default__` | 98/384 | `Bool` = true | 一次性迁移标志 |
| `wndColorThemeID` | 286/384 | `Bytes` | **窗口配色主题**，`UI/ColorThemes/{Carbon,Gallente,Photon,Plasma}` 之一 |
| `baseColorTemp` | 272/384 | 每个文件中均为 `None` | 自定义主题基色——此语料中从未设置 |
| `hiliteColorTemp` | 272/384 | 每个文件中均为 `None` | 自定义主题高亮色——同上 |
| `neocomLocationInfo_3` | 2/384 | `List[Bytes]`，如 `[b"nearest", b"sovereignty"]` | Neocom 位置读数内容 |
| `shipuialignleftoffset` | 315/384 | `Float`（2 个文件为 `Int`） | 飞船 HUD 水平偏移——已建模 |

为完整起见，按窗口 id 键控的字典：`windowSizesAndPositions_1`（384）、
`openWindows`（384）、`minimizedWindows`（384）、`stacksWindows`（367）、
`preferredIdxInStack3`（367）、`pinnedWindows`（352）、
`isLightBackgroundWindows`（343）、`isOverlayedWindows`（330）、
`lockedWindows`（330）、`collapsedWindows`（312）、`compactWindows`（184）。

同一字典中的窗口 id 有三种形态：普通名称（`overview`、`overview_1`、
`fitting`）、数字字符串（堆栈容器）以及字符串化的 Python 元组
（`('corpassets', <itemID>)`、`('myPlaces', (<folderID>, None))`、
`('RolesSummary', 'Container Access (Based at)')`）。

### 4.3 `notifications` — 4 个键

| 键 | 文件数 | 形态 |
|---|---|---|
| `notification_badge_offset` | 313/384 | `Tuple(Int, Int)` —— 徽章屏幕位置 |
| `notificationSettingsRepositionCount` | 313/384 | `Int` |
| `lastSeenNotificationId` | 374/384 | `Int` 或 `Long` |
| `lastSeenNotificationTime` | 331/384 | `Long` |

> **`notification_badge_offset` 在 `notifications` 中，不在 `ui` 中。**
> 语料中任何地方都没有 `ui → notification_badge_offset`。见 §9.1——
> 随附的 HUD 编辑器在 `ui` 下寻找它。

### 4.4 `dockPanels` — 7 个面板，各 9 个字段

键：`primary_map_panel`（320/384）、`solar_system_map_panel`（315）、
`ActivityTracker`（313）、`SkillPlanner`（265）、`careerPortal`（178）、
`ShipTree`、`PaintTool`。

每个都是普通字典（面板本身没有时间戳包装），恰好包含：

| 字段 | 类型 | 示例 |
|---|---|---|
| `align` | Int | `0`、`8` |
| `dblToggleFullScreenAlign` | Int | `0` |
| `positionX` / `positionY` | Float 0..1 | `0.5` |
| `widthProportion` / `heightProportion` | Float 0..1 | `0.8` |
| `widthProportion_docked` / `heightProportion_docked` | Float 0..1 | `0.5`、`1` |
| `pushedBy` | List | `[]` |

这是**布局画布目前不绘制的布局数据**——是比例值而非绝对值，但与窗口
几何属于同一问题领域。

### 4.5 `ui` — 296 个键，分组

该节是一个扁平容器。按领域分组，并给出携带该组典型键的文件数：

**总览列宽度与排序（逐标签页）** —— 两文件总览关联。
`SortHeadersSizes`（316）→ 以元组 `(b"overviewScroll2", tabIdx)`
键控的字典 → `{COLUMNNAME: widthPx}`。`SortHeadersSettings2`（314）
→ 相同键控 → `Tuple(columnName, ascending: Bool)`，即**逐标签页的
排序列**。某些文件上 `SortHeadersSizes` 还携带一个非元组的
`overview` 键。

**HUD / 屏幕部件。** `fightersDetachedPosition`（319）`Tuple(Int, Int)`。

**窗口外观。** `windowTransparency`（200）`Float`、
`windowTransparencyLightMode`（176）`Float`、`neocomSizeLocked`（297）
`Bool`、`window_compact_mode_default`（8）`Bool`。注意
`windowTransparency` 也存在于*账号* `ui` 节（136/175）——客户端采信
哪一个未经测试。

**信息面板**（左侧信息面板堆栈，按上下文）。
`InfoPanelModes_hangar`（360）、`_charsel`（352）、`_inflight`（332）、
`_structure`（325）、`_skill_plan`（265）、`_ActivityTracker`（313）、
`_ActivityTracker_dockablePanel`（177）、`_planet`、`_starmap_new`、
`_systemmap_new`、`_None`。形态：`List[[panelID: Int, mode: Int]]`
—— 有序的面板/模式对列表。

**导航与自动驾驶。** `autopilot_waypoints`（338）
`List[<solarSystemID>]`、`autopilot_avoidance2`（313）
`List[<solarSystemID>]`、`pfRouteType`（322）`Bytes` =
`safe`/`shortest`、`pfAvoidSystems`（313）`Bool`、`pfPenalty`（272）
`Int`、`pfAvoidEdencomSystems`（176）`Bool`、
`pathFinder_includeJumpGates`（272）`Bool`。

**无人机。** `droneAggression`（313）`Bool`、`droneFocusFire`（313）
`Bool`、`drone_warp_warning_enabled`（273）`Bool`、`dronesViewMode`
（178）`Int`。

**飞船行为默认值。** `defaultTypeOrbitDist`（278）、
`defaultTypeKeepAtRangeDist`（277）、`defaultTypeWarpToDist`（313）
——均为 dict `{<typeID or 0>: distanceMetres}`，其中键 `0` 是全局
默认值。

**扫描器。** `directionalScannerMode`（313）`Int`、
`directionalScannerShowCone`（313）`Bool`、`directionalScanFilterPos`
（313）`Float`、`directionalScanPanelOpen`（315）`Bool`、
`probeScanPanelOpen`（315）`Bool`。

**地图。** `mapview2_colormode_primary`（313）`Int`、
`mapview2_recent_colormode_primary`（313）`List[Int]`、
`mapview2_showJumpBridges_primary`（313）`Int`、
`mapview2_systemmap_markers_primary` / `_solarsystem`（313/314）
`List[Int]`、`mapview2_autoFocusEnabled_solarsystem`（315）`Bool`、
`mapViewColorModeScrollPosition_primary`（313）`Float`、
`mapDirectionPanelEmbedded` / `mapProbePanelEmbedded`（313）`Bool`、
`solarSystemView_loaded_solarsystem`（315）`Int`、
`mapView_searchString`（314）`Str`。

**相机。** `spaceCameraID`（332）`Bytes` = `shiporbit` /
`shiporbitabyssalspace` / `tactical`、`orbitCameraAutoTracking`（314）
`Bool`、`sensorSuiteEnabled`（332）`Bool`。

**舰队。** 由应用的 Fleet 视图（`fleet.rs`）建模：
`setFleetFormation`（280）`Int` —— 0 Point、1 Sphere、2 Plane、3 Wall、
4 Arrow、5 Relative（客户端的 `evefleet/const.py`）、
`setFleetFormationSize`（280）`Int`、`setFleetFormationSpacing`（278）
`Int`、`fleet_watchlistcolors`（177）dict `{<charID>: (r, g, b)}`
—— 这些键目前都是 `Int`，一旦 id 超过 2³¹ 就是 `Long`、
`fleetfinder_showGroupAndHighStandingsFleets`（292）`Int`。未建模：
`fleetAdvert_lastAdvert`（314）dict 或 `Instance(utillib.KeyVal)`、
`fleetAdvert_lastAdvertAdvancedOptions`（236）含 8 个字段的 dict、
`fleetReconnect`（367）`None` 或 `Tuple(Long, Long)`、
`fleetWathlistMemberInfo`（始终为 `{}`）。

**战斗日志格式。** `damageMessages_config`（314）与
`generalMessages_config`（314），均为 `Tuple(Int, Bytes align, Int,
Int|Float)`。

**市场 / 合同 / 资产 / 钱包** —— 搜索状态、筛选 id、排序键、缓存的
ISK 值：`market_searchText`、`market_value`、`market_last_update`、
`market_requires_update`、`marketGroupID_groupList`、`assets*`、
`corpAssets*`、`contracts_*`、`mycontracts_filter_owner`、`plex_value`、
`walletWindowTab`、`walletWindowHeight`、`walletWindowCollapsed`、
`journalIncursionTab`。

**面板选择 / 最近查看状态** —— `charSheetSelectedPanel`、
`corpWindow*SelectedPanel`、`skillCatalogueCombo`、
`SkillPlanTopLevelPanel`、`SkillPlanBrowserToggleBtnID`、
`fittingInvCombo`、`careerPortal_*`、`contacts_lastselected`、
`bookmarkFolderAndSubfolder`、
`bookmarkExpiryByFolder_<folderID>_<subfolderID>`。

**聊天。** `chatchannels`（367）`List[Tuple(kind, channelKey, label)]`
—— 角色已加入的频道；`chat_OldChannelsMigrated`（367）`Bool`。

聊天窗口在 `windows` 下的 id 是 **`chatchannel_` + 元组的第一个
元素** —— 2026-07-28 在游戏中确认，对命名的声望频道与私人会话同样
成立：

| `chatchannels` 条目 | 窗口 id |
|---|---|
| `(b"corp", "corp_98000003", "Corp")` | `chatchannel_corp` |
| `(b"alliance", "alliance_99000001", "Alliance")` | `chatchannel_alliance` |
| `("private_40fcd4de…", "private_40fcd4de…", "Private Chat (2)")` | `chatchannel_private_40fcd4de…` |

此前这是推断而非观察，担心在于真实 id 可能携带键中所没有的 kind 段
——那样每个聊天窗口都会静默保留错误的派生名，且任何地方都不报错。
事实并非如此：私人会话的键已自带 `private_` 前缀，因此两种 kind 的
派生方式相同。第三个元素是频道的显示名称，`windowLabels.ts` 尚未
使用（见 `docs/small-tasks.md`）。

**Neocom。** `neocomButtonRawData`（370）`List[Instance]`、
`neocomButtonRawDataOriginal`（367）`Tuple[Instance]` —— neocom
按钮集合。格式记录于 `format-notes.md` §"Neocom buttons"；已建模
（重排/移除/添加/重置）。该栏宽度是同一节中的 `neocomWidth` `Int`
（默认 48，32..72），仅在玩家调整过栏大小后才写入；其所在侧是
`neocomAlign`（4 左、6 右；默认左——语料中没有文件设置它）。

**逐项 / 会话状态 —— 不要建模。** `listgroups`（348，561 个键）、
`viewedWrecks`（367）、`neoblinkByID`（290）、
`ScrollColumnHeader_State`（234）、`agencyFiltersByContentGroupID`、
`containerSortIconsBy_*`、`contentScroller_*`、
`achievements_recently_*`、`tracked_opportunities_*`、`expanded_job`、
`infoPanelExpandedMission`、`corporation_recruitment_*`。

### 4.6 `autorepeat` / `autoreload`

两者都是以 `Long` **物品 id**（某个已装配模块）为键的字典，值为
`Int`。`autorepeat` → `0` 或 `1000`；`autoreload` → `0` 或 `1`。
`autorepeat` 在一个角色上可达 3625 个条目。特定于角色且特定于物品：
值得记录，不值得做编辑器，也**不**值得在角色间复制（目标上不会存在
这些物品 id）。

---

## 5. 账号文件 — `core_user_<accountID>.dat`

根是一个包含 **10 个节**的字典，每个文件都全部出现。

### 5.1 节映射

| 节 | 键数 | 内容 |
|---|---|---|
| `ui` | 955（549 个常见） | 图形/相机、聊天、市场、库存、装配、扫描器、`editHistory`…… |
| `tabgroups` | 338 | 每个窗口堆栈的选中标签页 + 标签 |
| `overview` | 35 | 整个总览配置 |
| `audio` | 22 | 逐频道音量与静音 |
| `suppress` | 18 | 已关闭的"别再问我"对话框 |
| `defaultoverview` | 3 | 安装了哪个捆绑总览包 |
| `cmd` | 1（`customCmds`） | **快捷键** |
| `windows` | 1（`neocomWidth`） | **遗留** neocom 宽度 —— 迁移前的副本；客户端读取角色文件的 `ui → neocomWidth` |
| `localization` | 0 | **始终为空** |
| `notifications` | 0 | **始终为空** |

### 5.2 `overview` — 35 个键

应用已建模：`overviewProfilePresets`、
`overviewProfilePresets_notSaved`、`overviewColumns`、
`overviewColumnOrder`、`tabsettings_new` / `tabsettings`、
`tabsByWindowInstanceID`、`stateColors`、`backgroundStates2`、
`backgroundOrder2`、`flagStates2`、`flagOrder2`、`applyToStructures`、
`applyToOtherObjects`、`useSmallColorTags`、`useSmallText`、
`overviewBroadcastsToTop`、`hideCorpTicker`。

未建模：

| 键 | 文件数 | 形态 | 含义 |
|---|---|---|---|
| `shipLabels` | 134/175 | `List[dict]` | **总览标签合成器。** 每个条目：`pre` / `post`（标记 `Bytes`）、`state`（`Int` 0/1 = 启用）、`type`（`Bytes`：`ship type`、`alliance`、`corporation`、`pilot name`、`ship name`，或 `None`）。列表中的顺序即渲染顺序。 |
| `stateBlinks` | 134/175 | 以 `(surface, stateID)` 键控的 dict → `Bool` | 哪些状态闪烁。surface 有 `background` **和** `flag`。凡有此键的文件中都恰好 8 个条目。 |
| `activeOverviewPreset` | 140/175 | `Bytes` 或 `Tuple(b"notSaved", name)` | 当前选中的预设。**140/140 都解析为真实的 `overviewProfilePresets` 键。** |
| `targetCrosshair` | 134/175 | `Bool` | |
| `showInTargetRange` | 134/175 | `Bool` | |
| `showCategoryInTargetRange_6` / `_11` / `_18` | 134/175 | `Bool` | 逐类别（6/11/18 = EVE category id） |
| `showBiggestDamageDealers` | 134/175 | `Bool` | |
| `showModuleHairlines` | 134/175 | `Bool` | |
| `viewTactical` | 137/175 | `Bool` | |
| `viewTactical_camTactical` | 131/175 | `Bool` | |
| `presetHistoryKeys` | 132/175 | 以 `(contentHash, Int)` 键控的 dict | 导入包的最近使用记录（只读） |
| `restoreData` | 132/175 | `{name, data, timestamp}` | 上次导入的包原样内容（只读） |
| `tabsettings2` | 75/175 | dict | **死键** —— 见下文 |
| `unfiltered` | 2/175 | | 罕见 |
| `filterOut` | 1/175 | | 罕见 |

**三代标签页设置。** `tabsettings`（138/175）、`tabsettings2`
（75/175）与 `tabsettings_new`（48/175）共存，且在同一个文件中保存
*不同*内容。由实验 diff（`testdata/exp3a-user.diff`、
`exp3b-user.diff`）解析得出：游戏内添加/重排列会用真实改动重写
`tabsettings_new`，时间戳更新 `tabsettings` **而不改变其内容**，
并且完全不碰 `tabsettings2` —— 连时间戳都不碰。语料中的一个账号
（最后写入于 2026-07-22，即由当前客户端写入）**只**携带
`tabsettings_new`，两个较旧的键都不在。因此顺序是：
`tabsettings_new` 权威，`tabsettings` 是为旧客户端保留存活的遗留
镜像，`tabsettings2` 是被废弃的中间世代。应用的读取顺序（先
`tabsettings_new` 后 `tabsettings`）是正确的；`tabsettings2` 应当
不被触碰，目前确实如此。

**2026-07-28 对照全语料确认。** 扫描全部 **174 个不同账号文件**
（2,897 份副本按内容去重），130 个至少携带一个标签页键：

| 存在的键 | 文件数 |
|---|---|
| `tabsettings` + `tabsettings2` + `tabsettings_new` | 60 |
| 仅 `tabsettings` | 46 |
| 仅 `tabsettings_new` | 12 |
| `tabsettings` + `tabsettings2` | 11 |
| `tabsettings2` + `tabsettings_new` | 1 |
| **仅 `tabsettings2`** | **0** |

两个事实足以说明可以忽略它：

1. **`tabsettings2` 从不是唯一的标签页键**（130 个中的 0 个）。因此
   读取顺序绝不会出现编辑器显示空标签页列表而 `tabsettings2` 里有
   内容的情况。
2. **在每个携带 `tabsettings_new` 的文件上，`tabsettings2` 都更旧**
   —— 这类 61 个文件中没有例外。凡是现代键存在的地方，被废弃的键
   总是落在其后。

确实有 11 个文件中 `tabsettings2` 携带最新时间戳，这看起来令人担忧，
直到你看到**这 11 个全都不含 `tabsettings_new`**。它们是 Photon
之前的备份（`settings_Default - before photon mandatory`，外加一个
`core_user_13000001 - old.dat`），其中 `tabsettings2` 的写入时间比
`tabsettings` 大约晚 0.08 秒 —— 同一次保存，最后写入。

**唯一诚实的注意事项。** 在那些 Photon 之前的文件上，两个键保存着
真正不同的内容（`tabsettings2` 大约大一倍，预设与列清单不同），而
编辑器读取 `tabsettings`。那个时代的客户端读取哪一个已属未知且现在
无法测试——没有当前客户端会读取 Photon 之前的文件。只有打开历史
备份才能触及它，而且编辑器在那里写的任何内容也不会被实机客户端
加载。

### 5.3 `cmd → customCmds` —— 快捷键

175/175 个文件，101 个不同命令名，每个文件 0–96 个条目。

值是**Windows 虚拟键码的元组**，`None` 表示"未绑定"：

```
CmdActivateHighPowerSlot1   -> (81,)          Q
CmdActivateMediumPowerSlot1 -> (17, 81)       Ctrl+Q
CmdDronesReturnAndOrbit     -> (18, 16, 68)   Alt+Shift+D
CmdActivateLowPowerSlot1    -> None           unbound
```

观察到的修饰键：16 = Shift、17 = Ctrl、18 = Alt；其余是标准 VK 码。
有两件事交叉验证这一解读：这些码解码为物理上相邻的键（模块槽 1–6 为
`Q S D F G H`），且 EVE 的*出厂*模块绑定是 F1–F8（VK 112–119），
它们在任何文件的绑定中都不出现（该缺失的含义见下文）。命令名可以
整齐分组：

- `CmdActivate{High,Medium,Low}PowerSlot1..8` —— 模块激活（24）
- `CmdOverload{High,Medium,Low}Power{Rack,Slot1..8}` —— 超载（27）
- `CmdDrones*`、`CmdLaunchFavoriteDrones`、`CmdReconnectToDrones`、
  `CmdSelectAllFighters` —— 无人机/战斗机
- `CmdApproachItem`、`CmdKeepItemAtRange`、`CmdWarpToItem`、
  `CmdAlignToItem`、`CmdDockOrJumpOrActivateGate` —— 导航
- `CmdLockTargetItem`、`CmdUnlockTargetItem`、
  `CmdSelect{Next,Prev}Target`、`CmdToggleShipSelection`、
  `CmdToggleLookAtItem` —— 锁定目标
- `CmdFleetBroadcast_*`、`CmdSendBroadcast_Target` —— 舰队广播
- `Open*` / `Toggle*`（`OpenFitting`、`OpenAssets`、`OpenMail`、
  `OpenSkillsWindow`、`ToggleProbeScanner`……）—— 窗口快捷键
- `CmdRefreshDirectionalScan`、`CmdRefreshProbeScan`、
  `CmdToggleAutopilot`、`CmdToggleTacticalOverlay`、
  `CmdSetSearchBarFocus`、`CmdShowItemInfo`

**已更正：EVE 为该客户端构建写入整张命令表，而不是用户改动的
diff。** 每个文件的命令名集合严格按客户端世代嵌套 —— 79 ⊂ 90 ⊂ 91 ⊂
92 ⊂ 93 个名称，每一步恰好新增一个命令 —— 这正是一张由客户端拥有的
表在 CCP 随时间添加命令时的样子；若按"只有用户改动"的假设，玩家就
必须在每个客户端版本里恰好额外改动一个命令，单调递增，从不移除一个。
上文提到的 F1–F8 缺失佐证了这一点：出厂默认一旦被覆盖，就不会在文件
的任何地方存活。`None` 表示**未绑定**，而不是"回退到默认值"——
一个从未打开过游戏内快捷键界面的账号，其表是**空的**而非默认的
（已在实机 Tranquility 账号文件上验证）。完整证据见
`docs/superpowers/specs/2026-07-26-keybindings-editor-design.md`
§2.4–§2.5。

### 5.4 `audio` — 22 个键

三个族，跨越两套不同的频道集合：

| 族 | 频道 | 类型 | 含义 |
|---|---|---|---|
| `inactiveSounds_<ch>` | `advancedSettings`、`aura`、`boosters`、`explosions`、`impacts`、`music`、`planets`、`shipsound`、`stationext`、`stationint`、`structures`（11 个） | `Int` 0/1 | 频道静音 |
| `custom_<ch>` | `atmosphere`、`secondaryinterfaces`、`shipeffects`、`shipsounds`、`turrets`（5 个） | `Float` 0..1 | 自定义混音电平 |
| `soundLevel_<ch>` | `advancedSettings` + 上述 5 个 `custom_*` 名（6 个） | `Int` / `Float` | 频道音量 |

共 22 个键。注意其中的不对称：11 个静音开关没有对应的 `soundLevel_`
条目，而 `custom_*` 频道既带电平，又带一个它的
`soundLevel_custom_*` 副本。

主音量位于*机器*文件（§6），不在此处。

### 5.5 `suppress` —— 已关闭的对话框

18 个键，全部为 `suppress.<DialogName>` → `Int`（值 `1` 或 `6`
—— 推测是选择了哪个按钮/抑制多久的位掩码）。

观察到的：`AskQuitGame`（158/175）、`AskActivateTech3Ship`、
`AskUndockWithModulesLackingSkill`、`AttackGoodNPCAbort1`、
`ConConfirmCreateContract`、`ConNonEmptyContainer2`、`ConNonEmptyShip`、
`ConfirmJumpTo{Edencom,Triglavian,Invaded,Unsafe}SS`、
`ConfirmOneWayItemMove`、`ExternalLinkWarning`、
`GateTollConfirmUnAligned`、`InsAskAcceptTerms`、
`Multiple Pilot Training`、`TradeShipWarning`、
`WormholeJumpingFromHiSec`。

另有一个*独立的* `ui → suppress` 键（150/175，`Int` 0/1）——
全局开关，不是同一回事。

### 5.6 `tabgroups` —— 堆栈标签页状态

338 个键，成对出现：`<windowID>` → `Int`（堆栈内选中的标签页索引）
与 `<windowID>_names` → `Str`（该标签页的显示标签，如
`"Character: Information"`）。

窗口 id 是在*角色*文件的 `windows → stacksWindows` 中铸造的**数字
堆栈容器 id**。因此堆栈成员关系与标签页顺序是角色作用域的，而
*选中的*标签页及其标签是账号作用域的 —— 窗口堆栈编辑器目前不触及
这种作用域拆分。

### 5.7 `defaultoverview` — 3 个键

`defaultOverviewID`（83/175）`Bytes` —— 该账号已安装的捆绑总览包
的 id；`overviewID`（78/175）`Bytes` 或 `None`；
`defaultOverviewInformedOfUpdate`（83/175）`Int`。这正是 EVE 自带
"默认总览包"功能所用的钩子，与我们的导入/导出包相邻。

### 5.8 `ui` — 955 个键，分组

**图形与相机（账号作用域）** —— 161/175 个文件，这一簇使得 Camera
Shake 成为可靠的账号写入触发器：`cameraShakeEnabled`、
`cameraBobbingEnabled`、`cameraDynamicMovement`、`cameraInertia`
（Float）、`cameraSensitivity`（Float）、`cameraInvertY`、
`cameraOffset`、`invertCameraZoom`、`advancedCamera`、
`offsetUIwithCamera`、`effectsEnabled`、`explosionEffectsEnabled`、
`trailsEnabled`、`turretsEnabled`、`missilesEnabled`、
`droneModelsEnabled`、`gpuParticlesEnabled`、
`modelSkinsInSpaceEnabled`、`NCCgreenscreen`、
`UI_ASTEROID_{ATMOSPHERICS,CLOUDFIELD,FOG,GODRAYS,PARTICLES}`。
除两个 `Float` 外全为 `Int` 0/1。

`disabledGuids`（141/175）—— 最多 159 个 `effects.<Name>` 键的
dict：逐个禁用的视觉效果。

`spaceMouseSpeedCoefficient` / `spaceMouseAccelerationCoefficient`
（150/175）`Float`。

**HUD（账号这一半）。** `shipuialigntop`（131）、`detachFighterUI`
（130）、`displayFighterUI`（131）—— 已建模。

**聊天。** `chatfontsize_chatchannel_<channel>`（`Int`，约 12 个）、
`chatinputsize_chatchannel_<channel>`（`Int`）、
`chatchannel_<channel>_userlistwidth`（`Int`）、
`chatCondensedUserList_<channel>`（`Bool`）、
`chatWindowBlink_chatchannel_<channel>`（`Int`）、
`chatchannel_local_mode`（`Int`）、`timestampchat`（`Bool`）、
`logmessageamount`（`Int`，1000）、`guestCondensedUserList`（`Bool`）、
`chatPlayerChannelsJoined`（`player_<channelGUID>` 的 dict）、
`player_<channelGUID>Password` —— **明文的聊天频道密码**。绝不要把
它放进导出或共享包。

**市场。** `market_filter_{highsec,lowsec,zerosec,jumps,price,quantity}`
（`Bool`）、`market_filters_{buy,sell}orderdev`（`Bool`），以及各自
的 `minEdit_` / `maxEdit_` `Int` 边界；`market_ticker_enabled`、
`marketselectorwidth_region`、`pricehistorytype`、`multiSellDuration`、
`quickbar` + `quickbar_lastid`。

**库存。** 按容器名或 `<name>_<itemID>` 键控的逐容器族：
`containerViewMode_*`（`Bytes` = `icons`/`details`）、
`containerSortIconsBy_*`（`Tuple(field, direction)`）、
`invFiltersExpanded_*`、`invTreeExpanded_*`、
`invTreeViewEntryToggle_*`、`invLastOpenContainerData_*`、
`invTreeViewWidth_*`。大多是逐项状态。

**装配。** `fittingLeftPanel`、`fittingPanelLeft3`、
`fitting_browserBtnID`、
`fitting_filter_ship_{personal,corp,community}Fittings`、
`defaultFittingPosition`、`showEmptySlots`、`showhavecpuandpower`、
`lockOverload`、`slotOrder`（逐飞船 HUD 槽位布局 —— format-notes
"Ship slot order"）、`linkedWeapons_groupsDict`、
`fitting_hardwareSearchField`。

**扫描器。** `probeScannerFilters`（命名筛选器的 dict）、
`activeProbeScannerFilter`（`Str`）、`scannerShowAnomalies`、
`scan_angleSlider`（`Float`）、`scanner_rangeEditMode`、
`dir_scanrange`、
`probescanning.resultFilter.{filters,activeFilterSet,showingAnomalies}`、
`scanner_presetInUse` —— **这是一个总览预设名**（129/129 解析成功）。

**自定义探针阵型。** `probescanning.customFormations`（114/175）
是一个 dict
`{Int formationID: (name, List[((Float x, Float y, Float z), Float range)])}`
—— 来自扫描器阵型菜单的已保存探针布置。
`probescanning.selectedFormationID`（114/175）`Int` 是活动阵型的 id，
在每个拥有它的文件中均为 `0`。

- **每个阵型恰好包含 8 个探针条目**（123 个阵型，984 个条目，没有
  其他长度）。
- 所有 984 个条目中 `range` 均为 `74798935350.0` —— 恰好是 0.5 AU
  （以米计）。这是逐探针设置，而 **0.5 AU 是战斗扫描探针的下限**
  （核心探针可达 0.25 AU），这就是语料中从不变异的原因：这些是战斗
  探针在这些探针所允许的最紧距离上的阵型，而不是客户端写入的常量。
  2026-08-04 在游戏中确认 —— 一个以 0.25 AU 制作的阵型，用 Sisters
  Combat 探针发射后，8 个条目全部回到 0.5 AU。存储的距离在加载时
  是否被应用仍未经测试；以 4 AU（避开所有下限）制作一个并读取扫描器
  即可定论。该格式**不记录探针类型**，因此编辑器无法校验下限，只能
  就此告警。
- 坐标是相对阵型中心的米偏移，不是绝对位置。`"close"` 跨度约
  ±22e9 m（约 0.15 AU）；`"on grid"` 约 ±10e6 m（约 10 000 km）。
- **`+Z` 是游戏内的北。** 2026-08-04 在游戏内测量。将三个探针置于
  `+X`（500/600/700 km）、两个置于 `+Y`（1500/1600 km）、一个置于
  `−Z`（1000 km）的阵型发射，并对照战术叠加层读取：三探针簇位于
  **西**，两探针簇正**上**，单个探针在**南**。各组大小取 3/2/1
  正是为了不必单独识别任何探针。

  | 轴 | 游戏内 |
  |---|---|
  | `+Z` | 北 |
  | `−X` | 东 |
  | `−Z` | 南 |
  | `+X` | 西 |
  | `+Y` | 上 |

  另一次发射得出一致结论：一个每个轴方向各带一个探针的标记阵型，
  把 `+Z` 标记放在叠加层上最靠近北的位置。单凭那一次读取**并不**
  确凿，原因值得记录 —— 飞船位于距阵型中心 75 km 处，因此其总览
  距离与制作的偏移根本不符，每个方位都被扭曲（300 km 标记上偏 8°）。
  该偏移由八个距离解算得出（rms 0.3 km），从而还原哪个探针是哪个。
  **只有当飞船位于阵型中心时，总览距离才能唯一指认探针，而飞船并不
  保证在那里** —— 与下文"存储的原点不是探针质心"一条所提出的告诫
  相同，只是从另一面看到。

  **该坐标系是世界固定的，从来不存在别的可能。** EVE 没有可供阵型
  旋转进去的飞船相对坐标系：飞船是带位置的球体，其朝向不被物理
  使用，因此"飞船的朝向"并不是客户端可以施加的东西。上文 42 AU
  往返的结果佐证了这一点 —— 它回来时是一个**轴对齐的**盒子，逐轴
  按 2 的幂量化；若在发射时从飞船相对坐标转换而来，就会把误差涂抹
  到各轴上。

- **游戏内保存的阵型并不总能原样返回，其损失取决于飞船当时在哪。**
  2026-08-04 在游戏内测量：一个每轴 ±2 309 401 m（距中心 4000 km）
  的制作立方体，8 个 Sisters Combat 探针，从三个位置发射并重新
  保存：

  | 位置 | 保存回来 |
  |---|---|
  | 恒星落点（约 1e9 m） | 每轴 ±2 309 401 m —— 精确 |
  | 约 42 AU | 半长 2 097 152 / 2 359 296 / 2 359 296 m —— 一个**盒子**，不是立方体 |
  | 约 90 AU | 每轴 ±2 097 152 m |

  总览距离证实探针确实位于保存文件所说之处：在恒星处八个都是
  4 000 km，在 42 AU 处八个都是 3 941 km（该盒子的半对角线）。因此
  损失发生在太空中，在客户端读取文件与写回文件之间 —— 不在文件
  格式里，也不在编辑器所做的任何事情里。

  <a id="probe-precision-speculation"></a>
  > **推测 —— 从这里到该条目末尾的全部内容，是拟合三次保存得到的
  > 一个假设，不是语料测量。** 把上面三行视为唯一确立的事实。代码库
  > 中不应有任何东西依赖其正确性。
  >
  > 这些数字落在 2 的幂上：2 097 152 = 2^21，2 359 296 = 9 × 2^18。
  >
  > 这与探针位置经由 `float32` **绝对**坐标往返相符，在量级 `c` 处
  > 可表示的步长为 `2^(floor(log2 |c|) - 23)` m。制作的 2 309 401 m
  > 然后在一个轴上舍入为 2^19 的 4 步、在另一个轴上为 2^18 的 9 步
  > —— 这正是 42 AU 盒子所显示的，并意味着每个轴按其自身坐标量级
  > 独立量化，因此畸变是各向异性的，无法仅从半径预测。
  >
  > 如果确实如此，网格会随距离变粗，如下表。半径是任一单轴的
  > **最坏情况**；坐标小于 `r` 的轴会得到更细的步长。"最小忠实偏移"
  > 是 50 × 步长，即低于它时最坏误差超过 1% 的偏移。
  >
  > | 距恒星距离 | 网格步长 | 每轴最坏误差 | 最小忠实偏移 |
  > |---|---|---|---|
  > | < 0.007 AU | ≤ 128 m | ≤ 64 m | ≤ 6 km |
  > | 0.007 – 0.014 AU | 128 m | 64 m | 6 km |
  > | 0.014 – 0.029 AU | 256 m | 128 m | 13 km |
  > | 0.029 – 0.057 AU | 512 m | 256 m | 26 km |
  > | 0.057 – 0.115 AU | 1.0 km | 512 m | 51 km |
  > | 0.115 – 0.23 AU | 2.0 km | 1.0 km | 102 km |
  > | 0.23 – 0.46 AU | 4.1 km | 2.0 km | 205 km |
  > | 0.46 – 0.92 AU | 8.2 km | 4.1 km | 410 km |
  > | 0.92 – 1.84 AU | 16.4 km | 8.2 km | 819 km |
  > | 1.84 – 3.67 AU | 32.8 km | 16.4 km | 1 638 km |
  > | 3.67 – 7.35 AU | 65.5 km | 32.8 km | 3 277 km |
  > | 7.35 – 14.7 AU | 131 km | 65.5 km | 6 554 km |
  > | 14.7 – 29.4 AU | 262 km | 131 km | 13 107 km |
  > | 29.4 – 58.8 AU | 524 km | 262 km | 26 214 km |
  > | 58.8 – 118 AU | 1 049 km | 524 km | 52 429 km |
  > | 118 – 235 AU | 2 097 km | 1 049 km | 104 858 km |
  >
  > 三次保存无法把它与任何其他恰好以同样方式舍入 2 309 401 的规则
  > 区分开，表中也没有任何边界被测试过。要廉价地证伪它：制作跨越
  > 预测带边缘的偏移，并从已知距离保存 —— 飞船跨过边缘时步长应当
  > 翻倍。

- **存储的原点不是探针质心。** 同一次 42 AU 保存携带 Z 为
  −2 621 440 / +2 097 152：关于一个偏离文件起算原点 262 144 m 的
  中心对称 ±2 359 296。一个物理上以飞船为中心的阵型仍可能读起来
  不对称，因此下游任何东西都不得假设对称或归一化到对称。
- id 是**小的、被复用的，而不是每个阵型铸造的**：在全部 114 个文件
  中 `0` 是 `"close"`，`1` 在 5 个文件中是 `"on grid"`。`"close"`
  的坐标在文件之间低位不同（114 个中有 3 种不同签名）—— 是同一个
  制作的阵型被重新保存并以不同方式舍入，而不是三个阵型。上文测量到
  的位置相关损失是可能的原因，尽管这一点尚未在 `"close"` 的规模上
  测试过。
- **编辑器保持 id 紧凑且等于列表位置。** 文件中不记录顺序，也没有
  测量客户端菜单是按 id 还是按 dict 顺序排序 —— 因此每次写入后
  编辑器都让两者一致：用户 id 为 `0..n-1`，dict 按该顺序写入，
  `selectedFormationID` 跟随其阵型，负 id 原样保留。重排即重新编号。
  **2026-09-19 在游戏中确认：** 扫描器的阵型菜单跟随重排后的文件。
  客户端按两者中哪一个排序仍未区分，而在编辑器保持两者一致期间也
  不需要区分。
- **id `-4` 是一个暂存槽，其名称是 `Bytes` 而非 `Str`。** 4 个文件
  携带 `-4: (b"tempFormation", …)` 与 `0` 并列，其坐标在 `"close"`
  的舍入距离内 —— 即客户端正在编辑的阵型副本。因此 id 是有符号的，
  负 id 不是用户阵型，任何读取名称的代码都必须同时处理 `Bytes` 与
  `Str`（§3 陷阱 5）。

**舰队。** 由应用的 Fleet 视图（`fleet.rs`）建模：
`listenBroadcast_<Type>`（`Int` 0/1），覆盖十六种类型 —— 客户端自己
写入其中七种，其余仅在切换时写入 —— 加上
`listenBroadcast_ShowOwnBroadcasts` 与一起写入的裸
`ShowOwnBroadcasts`；`fleet_broadcastcolor_<Type>` 覆盖同样的十六种，
`(r, g, b)` 或 `None` 表示 EVE 的 ✕。类型令牌、默认值与调色板浮点值
见舰队编辑器 spec §2。未建模（窗口状态）：`fleetHistoryFilter`、
`fleetFinderBroadcastsVisible`、
`fleetfinder_{scope,range,standing}Filter`、`updateOnBossChange`、
`hideInfo`、`public`、`publicgood`、`corp`、`alliance`。

**结构浏览器。**
`structurebrowser_{all,my}Structures_filterContController_{services,structureTypes}_{IsActive,filter_<tuple>}`。

**杂项 UI。** `windowTransparency`（`Float`）、`defaultDockingView`、
`defaultStructureView`、`stationsLobbyTabs`、`showSensorOverlay`、
`autopilot_stop_at_each_waypoint`、`showZoomBtns`、`showReadout`、
`targetOrigin`（`Tuple(Float, Float)`）、`targetOriginLocked`、
`mapscale`、`alignHorizontally`、
`damageMessagesShow{Ship,Ticker,Weapon}`、`charsheet_showSkills`、
`notepadscrollistwidth`、`evemail_leftContWidth`、
`columnWidths_3` / `scrollsortby_3` / `primaryColumn_3` /
`smartSortDirection_3` / `filteredColumnsByDefault_3`（通用滚动列表
列状态，最后一个有 1136 个键）。

**自动填充。** `editHistory`（154/175）—— 已建模；最多 204 个控件
路径列表。

**记账类 —— 不要动。** `SeenPlex`、`SeenTokenStorage_SeenTokens`、
`SeenEventRewards_*`、`RewardsWindow_seen`、
`DLI_claimedRewardsByIdx{,2,3}`、`hasShownPointerToLoginRewardWnd`、
`newFeaturesAlreadySeen`、`freeSkillPoints`、`rewardWndTabSelected`、
`accountreftype`。

**需保留的异常项。** 一个字面为 `None` 的键（140/175）与一个元组键
`(b"windowTransparency", (b"user", b"ui"), <Float>)`（135/175）
都存在于这个 dict 中。它们不是我们应当暴露的设置，但必须在往返中
原样存活。

---

## 6. 机器作用域 — `core_public__.yaml` 与 `prefs.ini`

每个配置档目录各一个（语料中有 8 个配置档）。YAML，同一
`(FILETIME, value)` 约定，渲染为二元素序列。

`core_public__.yaml` 的节：

- **`device`** —— 应用今天无法访问的图形设置：`DeviceSettings`
  （后台缓冲区大小/格式、呈现间隔、窗口化标志）、`WindowMode`、
  `WindowedResolution`、`FixedWindow`、`FixedWindowSettings`、
  `FullScreenResolution`、`UIScaleWindowed` / `UIScaleFullscreen`
  （及其 `SetAutomatically` 标志）、`antiAliasing`、`aoQuality`、
  `shaderQuality`、`shadowQuality`、`textureQuality`、
  `charTextureQuality`、`lodQuality`、`postProcessingQuality`、
  `reflectionQuality`、`volumetricQuality`、`upscalingSetting`、
  `upscalingTechnique`、`fsrMode`、`frameGeneration`、`dofEnabled`、
  `brightness`、`charClothSimulation`、`fastCharacterCreation`、
  `resourceCacheEnabled`。
- **`audio`** —— 主音量：`audioEnabled`、`masterVolume`、`uiGain`、
  `worldVolume`、`eveampGain`、`evevoiceGain`、`useCombatMusic`、
  `suppressTurret`、`limitVoiceCount`、`useOldJukeboxOverride`。
- **`ui`** —— `clientFontSize`、`CSS_AdAlreadyDisplayed_*`、
  迁移标志。
- **`generic`** —— `showintro2`。

`prefs.ini` 是扁平 INI：`clusterMode`、`clusterName`、`languageID`、
`eulaagreed`、`newbie`、`host`/`port`、
`machoNet.acceptThreadCount`、小数/数位分隔符。**`languageID` 是
客户端语言**，也是唯一真正有意思的键。

此处的 `WindowedResolution` 是角色文件中每个窗口矩形所烘焙的
`screenW`/`screenH` 的对应物 —— 正是它使得"把此布局缩放到我当前
分辨率"的功能无需询问用户其分辨率即可实现。

---

## 7. 各部分如何关联

```
MACHINE  core_public__.yaml
         device.WindowedResolution ─────────┐  (= the screenW/screenH baked
         audio.masterVolume                 │   into every window rect)
                                            │
ACCOUNT  core_user_<acct>.dat               │
         overview.overviewProfilePresets ◄──┼── named by:
           ▲  ▲  ▲                          │     overview.activeOverviewPreset
           │  │  └──────────────────────────┼──── ui.scanner_presetInUse
           │  └─ tabsettings_new[i].overview │
           └──── tabsettings_new[i].bracket  │
                                             │
         overview.tabsettings_new[i] ────────┼── positional link ──┐
         overview.tabsByWindowInstanceID ────┘                     │
         tabgroups[<stackID>]  (selected tab + label)              │
         audio / cmd.customCmds / suppress / ui.*                  │
                                                                   │
CHARACTER core_char_<char>.dat                                     │
         windows.windowSizesAndPositions_1[overview, overview_1…] ◄┘
         ui.SortHeadersSizes[(overviewScroll2, i)]      (widths, per tab i)
         ui.SortHeadersSettings2[(overviewScroll2, i)]  (sort, per tab i)
         windows.stacksWindows      (member → stack container id) ──┐
         windows.preferredIdxInStack3 (container → member tab order)│
                                        └── same container id ──────┘
                                            keys tabgroups above
```

与编辑相关的关系：

1. **总览标签页是三方连接。** 标签页*定义*是账号作用域的
   （`tabsettings_new`，按标签页索引键控）；哪个总览*窗口*显示哪些
   标签页是账号作用域且**按位置**的（`tabsByWindowInstanceID[i]`
   ↔ 窗口 id `overview` / `overview_<i>`）；窗口的*几何*及其*列宽度
   与排序*是角色作用域的。已处理；在此记录是因为这正是总览编辑器是
   双文件的原因。

   **标签页索引同时是显示顺序。** EVE 按标签页索引升序绘制窗口的
   标签页；`tabsByWindowInstanceID[i]` 说明*哪些*标签页，而非以什么
   顺序。2026-08-13 在全语料上测量：携带映射的 **1,314** 个账号文件
   中，**0** 个以非升序列出窗口的标签页，且在拥有标签页表的全部
   2,572 个文件中该表都是紧凑的 —— 客户端重新编号而非排列该条带。
   因此重排标签页意味着重新编号该表
   （`overview_tabs::renumber_to_strip_order`）；只重写条带在游戏中
   什么都不改，这正是 2026-08-13 修复的 bug。

2. **预设名从四处被引用**，是该文件唯一的字符串键外键：每个标签页
   的 `overview` 与 `bracket` 字段、容器的 `activeOverviewPreset`，
   以及 `ui → scanner_presetInUse`。测量：标签页 `overview`
   1080/1080 解析成功，标签页 `bracket` 1039/1063（其余指向内置
   默认预设），`activeOverviewPreset` 140/140，
   `scanner_presetInUse` 129/129。重命名或删除预设必须重新指向
   全部四处 —— 见 §9.2。

3. **窗口堆栈横跨两个文件。** 成员关系与标签页顺序在角色文件中；
   选中的标签页及其标签在账号文件的 `tabgroups` 中，按同一个铸造的
   容器 id 键控。由我们的编辑器创建的堆栈不会有 `tabgroups` 条目
   —— 显然无害（EVE 默认标签页 0），但在*不同账号*之间批量复制
   布局时，堆栈被搬走而其标签页选择没有。

4. **HUD 被拆分到不同作用域**，已有记录：偏移在角色文件中（neocom
   宽度也是），开关在账号文件中。

5. **列词汇表是共享的**：`overviewColumns`/`overviewColumnOrder`
   （账号默认值）、`tabsettings_new[i].tabColumns`/`tabColumnOrder`
   （逐标签页覆盖）与 `SortHeadersSizes[(overviewScroll2, i)]`
   （角色宽度）都以相同的大写列名（`ICON`、`DISTANCE`、`NAME`、
   `TYPE`、`ALLIANCE`、`CORPORATION`、`FACTION`、`MILITIA`、`SIZE`、
   `VELOCITY`、`RADIALVELOCITY`、`TRANSVERSALVELOCITY`、
   `ANGULARVELOCITY`、`TAG`）为键。

---

## 8. 当前覆盖

| 领域 | 位置 | 应用覆盖 |
|---|---|---|
| 窗口几何 + 标志 | 角色 `windows` | **完整**（布局画布） |
| 窗口堆栈 | 角色 `windows` | **完整**（创建/解散堆栈/重排） |
| 飞船 HUD / 战斗机 UI / neocom | 角色 + 账号 | **完整**（徽章节已修复，§9.1） |
| 总览列（可见性、顺序、宽度） | 账号 + 角色 | **完整** |
| 总览标签页（创建/重命名/删除/重排/移动、窗口） | 账号 | **完整** |
| 总览筛选预设 + 分组 | 账号 | **完整** |
| 总览状态 / 颜色 / 标签 | 账号 | **部分** —— 仅 `background` surface；无闪烁 |
| 总览外观布尔 | 账号 | **部分** —— 13 个中的 6 个 |
| 总览导入/导出包 | 账号 | **完整** |
| 自动填充 / 记住的文本 | 账号 `ui.editHistory` | **完整** |
| 批量复制 | 双方 | 对其定义的类别**完整** |
| 下文其余全部 | — | **仅原始树** |

任何类型化编辑器都未触及的：快捷键、音频、图形/相机、被抑制的
对话框、飞船标签、可停靠面板几何、窗口配色主题、窗口透明度、聊天
设置、市场筛选、无人机/导航默认值、标签组标签，以及整个机器作用域。

---

## 9. 影响已发布代码的发现

### 9.1 HUD 徽章偏移读取了错误的节（bug —— 已修复）

**2026-07-26 在 `07ef6f0` 中修复，早于 v0.15.0 发布**（该发布仍是
草稿，因此是重新打标签而非修补）。保留在此是因为这个错误的*形态*
就是教训：`hud.rs` 中每个单元夹具都构建了与 `FIELDS` 表所声明的
相同形态，因此全部 20 个测试都在这个错误字段上通过。修复新增了
`crates/settings-model/tests/hud_corpus.rs`，它投射真实语料文件，
并在某个角色作用域锚点在任何地方都读不到内容时失败 —— 对旧节它
报告 `0/4215`。任何手工构建的夹具都抓不到这一类 bug。原始发现
如下。

`crates/settings-model/src/hud.rs:76-79` 声明：

```rust
Field { name: "badge_x", section: b"ui", key: b"notification_badge_offset", … }
```

但在全部 384 个角色文件中，该键位于
`root → notifications → notification_badge_offset`（313/384），而
**`root → ui → notification_badge_offset` 在语料中任何地方都不存在**。
后果：徽章锚点总是投射为其 `"0"` 默认值，而 `set_hud_value` 会铸造
一个 EVE 忽略的新 `ui` 键，同时真正的 `notifications` 条目保留其
旧值。`format-notes.md` §"HUD anchors" 有同样的错误路径，其单元
夹具构建了错误形态，因此测试通过。`ui` 下的
`fightersDetachedPosition` 是正确的。

### 9.2 预设重命名/删除留下两处悬空引用

`rename_preset` / `delete_preset`
（`crates/settings-model/src/overview_presets.rs:149,176`）会重新指向
预设键、`_notSaved` 镜像以及每个标签页 —— 但不包括
`overview → activeOverviewPreset`（140/140 个文件按名引用预设）
也不包括 `ui → scanner_presetInUse`（129/129）。重命名之后，账号的
活动预设与探针扫描器筛选器指向一个不再存在的名字。

### 9.3 `stateColors` 有第二个 surface

`format-notes.md` 陈述 `b"background"` 是观察到的唯一 surface。
在此快照中 `(flag, 48)` 也出现（2/175 个文件）。状态编辑器的行为
仍然正确 —— 它读写 `background` 并原样放行其他 surface —— 但笔记
中的说法是错的，而 *colortag* 颜色是一个真实（尽管罕见）的可编辑
surface。`stateBlinks` 在 134/175 个文件中使用两个 surface。

### 9.4 `(FILETIME, value)` 时间戳经常是 `Ref`

值得补进 `format-notes.md` §"Value-wrapper convention"：任何通过
在元素 0 上匹配 `Value::Long` 来识别带时间戳叶子、而不解析共享
引用的代码，都会把很大一部分真实叶子错分型。

---

## 10. 候选编辑器

按价值 ÷ 成本排序。"作用域"指一次编辑改变什么。

### 第一档 —— 高价值、自成一体

**1. 快捷键编辑器（已发布）** —— 账号作用域，`cmd → customCmds`。

**已在 `keybindings-editor` 分支上发布** —— 见 `KeybindsView.svelte`
与 `crates/settings-model/src/keybinds.rs`。不再是头号候选；保留在
此是因为该分析仍是有用的背景。原始发现如下。

缺失的单个最大功能。101 个命令，值是 VK 码元组，一个扁平 dict，
无跨文件关联，无结构化编辑（该 dict 已存在于 175/175 个文件中）。
需要一份手工编写的词汇表 —— VK 码 → 按键标签 —— 与总览状态 id
已使用的同一模式；命令名 → 友好标签 + 分组被证明可以从客户端自身
的本地化数据中收获（101 个中 84 个解析成功，其余回退到去驼峰的
名称）。解锁 EVE 从未发布过的东西：把一个账号的快捷键复制到其他
所有账号。加一个 `Keybinds` 批量类别，它就与现有 Batch 视图免费
组合。

**2. 总览外观补全** —— 账号作用域，`overview`。把
`OVERVIEW_BOOLS` 从 6 扩到 13（`targetCrosshair`、
`showInTargetRange`、`showCategoryInTargetRange_6/11/18`、
`showBiggestDamageDealers`、`showModuleHairlines`、`viewTactical`、
`viewTactical_camTactical`），在现有颜色控件旁加一个逐状态闪烁
开关 `stateBlinks`，并让 `flag` surface 可与 `background` 一起
编辑。全部复用已存在的机制。半天。

额外的动手理由：**包导入器在这里已经领先于 UI。**
`overview_pack.rs` 完整应用 `stateBlinks`（两个 surface）并原样
应用 `shipLabels` —— 用户能看到这些设置变化却无法编辑。它还把
`userSettings` 限制在同样的 6 个布尔（`overview_pack.rs:306`），
因此从 EVE 导出的、携带 `targetCrosshair` 或 `showInTargetRange`
的包在导入时被静默丢弃。放宽 `OVERVIEW_BOOLS` 一次编辑就同时补上
UI 缺口与导入缺口。

**3. 修复 §9.1 与 §9.2。** 不是功能，但两者都很小，且都在已合并的
代码中。

**4. 被抑制对话框管理器** —— 账号作用域，`root → suppress`。
18 个已知键，`Int` 值，外加一个清空该节的"全部重新启用"。很小，
而且这是 EVE 真正的恼人之处，游戏内没有 UI。

### 第二档 —— 高价值、需要新 surface

**5. 总览飞船标签** —— 账号作用域，`overview → shipLabels`。其
游戏内编辑器出了名的糟。一个有序段列表，含 `type`（固定 5 值
枚举）、一个启用标志与 `pre`/`post` 标记字符串。自然的归宿是现有
Overview 视图中的一个新标签页，与 Columns / Filters / Appearance
相邻。标记是 EVE 的 `<color=…>` / `<fontsize=…>` / `<b>` 方言
—— 实时预览就是全部价值主张。它已是包词汇表的一部分
（`shipLabels` / `shipLabelOrder`），因此导入/导出已能往返它；
这只是让它可编辑。

**6. 图形与相机** —— *两个*作用域一次做。`core_user → ui` 中
账号作用域的相机/效果开关（25 个键，全为 `Int` 0/1 加两个
`Float`）与 `core_public__.yaml` 中机器作用域的质量/分辨率/
升采样。账号这一半平凡且立刻有用（"把我的图形设置复制到我的其他
账号"）。机器这一半需要 YAML 读取器 —— 但 `yaml-rust2` 已是总览包
的依赖，且值约定完全相同。只做账号这一半是干净的第一刀；机器这一半
引入第三个作用域，应当单独决策。

**7. 音频** —— 账号 `audio`（22 个键）+ 机器
`core_public__.yaml → audio`（10 个键）。与图形同形，同样的两作用域
拆分，需求较少。与图形打包而不是单独发布。

### 第三档 —— 对现有功能的扩展

**8. 逐标签页总览排序列** —— 角色 `ui → SortHeadersSettings2`。
逐标签页 `(columnName, ascending)`，其键控方式与 Columns 标签页已
编辑的宽度完全相同。一个下拉框和一个方向切换，放在已有标签页列表的
地方。非常便宜。

**9. 窗口配色主题 + 透明度** —— 角色 `windows → wndColorThemeID`
（4 个已知值）、`ui → windowTransparency`、
`windowTransparencyLightMode`、`neocomSizeLocked`。是 Layout 视图
侧面板的自然补充。注意账号文件也有一个 `windowTransparency`；在
同时暴露两者之前先确定哪个胜出。

**10. 可停靠面板** —— 角色 `dockPanels`，5–7 个面板 × 9 个比例
字段。布局画布已绘制绝对矩形；这些是比例值，因此需要单独处理，
但它们是"我的屏幕布局"缺失的一半。

**11. 堆栈标签页标签** —— 账号 `tabgroups`。在 Layout 视图中显示
每个堆栈的选中标签页及其标签，并在批量复制把堆栈移到不同账号的
角色之间时随行携带。

**12. 新批量类别** —— Keybinds、Audio、Graphics、Suppress、
ShipLabels。每个都是单个 dict 或一个文件中的小键集；批量机制已搞定
难的部分。

### 明确不值得建模的

按物品/类型/空间站 id 键控的逐项状态（`autorepeat`、`autoreload`、
`seenInventoryItems`、`unseenInventoryItems`、`listgroups`、
`viewedWrecks`、`invTreeViewEntryToggle_*`、
`containerSortIconsBy_*`、`filteredColumnsByDefault_3`、
`bookmarkExpiryByFolder_*`）；缓存的经济数值（`assets_value`、
`market_value`、`plex_value`、`contract_value` 及其 `_last_update` /
`_requires_update` 兄弟键）；"我见过这个了吗"记账（`SeenPlex`、
`DLI_claimedRewardsByIdx*`、`newFeaturesAlreadySeen`……）；会话
状态（`fleetReconnect`、`restoreData`、`presetHistoryKeys`）；
以及始终为空的节。它们属于原始树，不属于别处。

**一条隐私提示：** `core_user → ui → player_<channelGUID>Password`
以明文存储聊天频道密码。我们添加的任何导出、打包或批量复制功能
都必须按名排除它，而不只是按节排除。
