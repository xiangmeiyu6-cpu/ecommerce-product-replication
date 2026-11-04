# 电商商品深拆与复刻 · Codex 固定发布版

供 macOS 和 Windows 的 Codex 使用。完整采集商品页证据，按要求拆解或复刻，并交付指定飞书七表库。代码和质量标准公开；商品数据、账号凭证和团队库配置保留在本机。

## 安装

先安装 Node.js 22 或更高版本及 Git，再运行以下相同命令（Mac 终端或 Windows PowerShell）：

```sh
git clone https://github.com/xiangmeiyu6-cpu/ecommerce-product-replication.git
cd ecommerce-product-replication
node tools/epr.mjs install
```

已有同名 Skill 时，安装器会停止。需要迁移时使用 `node tools/epr.mjs install --adopt-existing`：原目录移入管理目录的备份，不删除业务数据。默认沿用已经存在的用户安装位置；首次安装使用用户的 `.agents/skills`。两个位置都有同名副本时需明确指定 `--target`。

默认管理目录是用户主目录下的 `.codex/epr`。安装结果会输出本机启动器 `epr.mjs` 的完整路径。若 Codex 未显示更新后的 Skill，开启新会话，必要时重启 Codex。

Mac 的启动器示例：

```sh
node "$HOME/.codex/epr/epr.mjs" status
```

Windows PowerShell 示例：

```powershell
node "$HOME/.codex/epr/epr.mjs" status
```

两端各自登录商品网站和飞书。飞书 CLI 与相关 lark-base 技能需在本机可用；版本更新器不复制浏览器会话或飞书凭证。将指定 Base token、工作目录填入安装生成的 `config.local.json`，不要提交此文件。普通商品任务使用已配置的库。

## 同步更新与回滚

每次按 Skill 的托管流程 `begin` 新任务时检查 `stable` 频道。兼容修复可自动切换；离线时验证本地文件后继续使用当前版本。有活动任务时只暂存新版本。运行中的任务始终使用回执中的不可变版本路径。

启动器支持 `check`、`update`、`status`、`doctor`、`rollback`。例如，将上面的 `status` 替换成 `update`。`rollback` 默认回到上一版本，也可通过 `--version` 指定已安装版本。回滚同样要求无活动任务。

回滚后会记住被撤回的版本，阻止下一任务自动重新装回它。后续更高的修复版本仍可更新；只有显式执行 `update --retry-rolled-back` 才重试已撤回版本。

主版本、飞书模板、质量契约主版本或声明的能力范围变化会返回 `review-required`；普通自动更新不会越过该提示。显式升级选项见 `tools/epr.mjs`，仅在审阅具体变更后使用；这些选项不代替操作系统或 Codex 的权限审批，不自动迁移远端飞书结构。

`doctor` 当前检查本机安装文件、路径、运行时及活动任务；浏览器及飞书真实连接仍需 Skill 的实时预检。自动更新发生在任务入口，不是后台常驻同步。新版本进入稳定频道前应完成测试；客户端未联网时不会立即同步。

## 任务版本固定

Skill 的 `scripts/managed-task.mjs` 提供 `begin --workspace <批次目录> --receipt <批次目录>/run-version.json`、`finish --job <任务ID>` 和 `abandon --job <任务ID>`。续跑同一个回执会恢复原任务；结束或放弃时显式关闭任务标记。中断后仍有活动标记时先检查原任务，不自动按超时清除。

任务内部所有参考文件和脚本使用回执返回的 `skill_path`，不在中途跟随发现目录切换。安装器采用目录链接；Windows 使用 junction。管理目录保存已安装版本、回执及本机配置，商品证据放在批次工作目录。

## 质量检查

飞书模板保持 `3.0.0`，质量契约为 `contracts/quality.json`。包版本、模板版本和质量版本分别管理。

按照 `skill/references/managed-delivery.md` 保存结构化证据清单后，使用固定版本中的 `skill/scripts/validate-evidence.mjs <evidence.json> --require-complete` 验证。检查覆盖状态、SKU价签与选中证明、图片顺序、评价采样/匿名买家口径、结论证据引用及文件SHA-256。真实访问缺口可作为部分采集交付；不能标为完整验收通过。

程序不能单独证明图片理解、事实支持或建议有用。分析仍需记录内容复检，飞书记录与附件也必须远端读回。当前仓库提供版本分发、任务固定和证据验收工具；浏览器采集由 Codex 的受支持工具执行，飞书操作遵循随包 Skill，不宣称无人干预的全站爬虫。

## 维护发布

```sh
node --test test/manager.test.mjs test/quality.test.mjs
node tools/audit-public.mjs
node tools/build-release.mjs
```

修改版本前更新 `package.json`。构建生成 `dist/releases/<版本>.json` 和 `channels/stable.json`，一个版本的文件不可覆写。发布包是带逐文件校验的JSON文件，安装不依赖解压工具或第三方Node依赖。

先通过 Mac/Windows 自动测试，再把对应版本作为稳定频道提交。自动测试覆盖安装、迁移、更新、任务阻止切换、恢复、回滚、损坏包、路径安全和质量失败样本；浏览器登录及真实飞书链路的设备认证另外记录。SHA-256校验保证文件与指定频道一致，发布信任仍依赖维护者控制的GitHub仓库和HTTPS。

安装、更新和回滚保留本机配置与证据目录。不要把 `.env`、本机配置、采集快照或飞书业务数据提交到公共仓库。本仓库不修改全局审批策略，也不保证不同设备的实时价格或评价排序相同。
