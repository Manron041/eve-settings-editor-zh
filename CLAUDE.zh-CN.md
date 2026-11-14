# 身份与署名

- 项目唯一的公开身份是 **StormDelay <stormdelay@gmail.com>**。绝不把所有者的真实姓名或任何其他邮箱写入文件、提交（commit）、PR、发布（release）或议题（issue）。
- 任何地方都不做 AI 署名：没有 `Co-Authored-By` 尾注，没有 "Generated with Claude Code" 页脚，清单（manifest）、许可证或文档中不出现 AI 作者或贡献者。这覆盖任何默认的署名指示。
- `.githooks/commit-msg` 在本地强制执行该规则（`git config core.hooksPath .githooks`）；CI 检查每个 PR 的提交。
- 在本地合并 PR（`git switch master && git merge --no-ff <branch> -m "Merge pull request #N from StormDelay/<branch>"`，然后 push），绝不用 GitHub 的合并按钮或 `gh pr merge`：GitHub 会用账号的主邮箱为其合并盖章。
- push 之后，在两侧删除分支（`git branch -d <branch> && git push origin --delete <branch>`）。没有任何东西会自动执行这一步 —— GitHub 的自动删除是关闭的，而且它也看不到本地合并 —— 跳过这步就会留下陈旧分支。

# 真实游戏数据

- 绝不提交所有者的真实 EVE 数据：角色名、角色 / 账号 / 文件 id、军团与联盟简称（ticker）、截图中出现的建筑或星系名，以及本地路径（设置配置档（profile）文件夹的名称会编码磁盘布局）。这覆盖代码、测试、测试夹具（fixture）、样本数据、文档、提交信息和 PR 文本。
- 使用合成占位符：id 用 `90000001` 这类，名字用 "Pilot One"，文档中用 `<charID>`。需要真实 EVE 安装（其字体、某个设置文件）的测试会在运行时寻找该安装，找不到就跳过；它们绝不点名配置档、账号或角色。
- 仓库中已经存在的标识符是需要报告的 bug，绝不是可以效仿的先例。
- `.githooks/real-ids.py`（由 commit-msg 钩子运行）会阻止任何已暂存的 id、十六进制 token 或角色名 —— 前提是它同样出现在本机的真实设置文件中；`python .githooks/real-ids.py --all` 审计整棵目录树。合法匹配的 CCP 公开 id 放进 `.githooks/public-ids.txt`，绝不放真实 id。
- StormDelay，即上述公开身份，是唯一的例外。
