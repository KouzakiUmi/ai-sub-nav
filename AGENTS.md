# 项目账本 · ai-sub-nav（我的 AI 订阅手账）

## 目的与需求

站长个人公开网页（GitHub Pages 静态托管，要求简洁）：收录站长实际在用的订阅平台，
提供注册入口、免费额度信息、站长的注册送积分邀请码、站长个人评测；
另需自动化工作流从官网拉取最新优惠营销活动信息并更新页面。

已确认范围（用户逐轮给定）：

- 平台清单 16 个（用户截图 + 文字指定）：GLM Coding Plan、Kimi Code、MiniMax Code、MiMo Code、
  TRAE、Qoder、商汤小浣熊、讯飞 Loomy、OpenCode、Command Code、Devin、GitHub Copilot、
  SenseNova Token Plan、Gemini API、WorkBuddy、Open Design。分组 coding / api / work。
- 邀请码：用户选择「暂不放、之后自己填」→ 字段留空自动隐藏，提供站长编辑模式与导出闭环。
- 个人评测：用户自己写 → 完整评测 UI（评分 / 结论 / 优缺点 / 正文 / 场景）+ 空态印章 + 编辑模式。
- 托管：用户选择「本地交付 + 上线步骤」→ 不执行 git 远端操作，README 给完整推送与 Pages 步骤。
- 自动化：GitHub Actions 每日 06:00 北京时间 + 手动；抓取公开优惠写 `data/promos.js`。

## 验收与已验证事实

- Chrome headless + CDP 端到端（桌面 1440 / 移动 390，46 项断言全过）：16 卡片、搜索 / 筛选 / 空态、
  主题切换、锚点落点、scrollspy（含页顶清除）、站长模式写评测 → 草稿 → 复制 → 展开 → 导出 → 重置全链路、
  移动端页尾（办公组 / 优惠 / 页脚）可达、无控制台错误、无失败请求、无横向溢出。
  Edge headless 在本机启动即崩溃（仅生成 Crashpad 目录），故改用 Chrome。
- 验证期修复：`[hidden]` 被组件 `display:flex` 覆盖致站长横幅常显 → 全局 `[hidden]{display:none!important}`；
  hero 负 inset 致移动端 20px 横向溢出 → inset 水平归 0；主题切换 260ms 过渡产生低对比中间帧 → 改瞬时切换；
  scrollspy 页顶残留旧高亮 → scrollY<160 清除。
- 移动端整页截图超 Chrome 16384px 纹理上限出现空白尾段（捕获限制，非页面缺陷），
  改视口分段截图 + DOM 断言验证页尾。
- 抓取脚本真实运行：24 个官网来源，23 ok / 1 error（loomy.xfyun.cn 在本网络 ECONNRESET，
  页面诚实标记失败并保留链接）；动态页 / 无优惠文案页仅监测可达性与标题。
- 截图存证：preview-desktop.png（浅色）/ preview-mobile.png（深色）随仓库交付；其余临时截图清理。
- 事实字段均附来源 URL 与 checkedAt=2026-11-16；无法核实的（MiMo / Open Design 免费额度、
  Loomy 公开定价）明确写「以官网为准」或标 measured，不编造数字。

## 设计取舍

- 纯静态零依赖零构建：`globalThis.SITES / PROMOS` 数据文件同时兼容浏览器 classic script、
  file:// 直开与 Node ESM import（抓取脚本复用同一份 sites.js，单一真源）。
- 视觉：纸墨朱砂编辑手账风（暖纸底 + 墨色 + 朱砂主强调 + 金 / 玉 / 靛语义色），
  衬线中文标题 + 系统 sans 正文 + mono 数字；品牌色相 per-card（--h）借用调色板；
  Tokens 全部集中在 style.css :root / [data-theme=dark]。
- 编辑闭环无后端：站长模式草稿存 localStorage，导出 sites.js 覆盖推送即发布（GitHub Pages 无写接口）。
- 自动化只更新 promos.js；人工核对字段只提示哈希变动（「官网有更新」徽标），不自动改写，
  避免不可靠抓取污染事实口径。SPA / 抓取失败降级为监测与 stale 快照，不写假内容。
- 文档站 MDX 源码碎片（_jsx / 反引号）在抓取侧过滤，不进页面文案。

## 实现边界

- 无后端、无追踪、无外部 CDN / 字体下载（系统字体栈兜底）。
- 不代笔站长个人体验；评测空态为设计态而非占位 TODO。
- git 远端与部署：用户本次明确授权「建一个 repo 并且部署」；目标 KouzakiUmi/ai-sub-nav（public），
  Pages 分支部署 main / (root)，站点 https://kouzakiumi.github.io/ai-sub-nav/ ；
  提交身份 KouzakiUmi <kent0629@gmail.com>（账号已验证邮箱），SSH 签名密钥与账号注册 signing key 匹配。
  执行结果以会话报告与 README 为准。

## 维护约定

- 增删平台：只改 `data/sites.js`（schema 见 README）；`promoSources` 决定自动监测源。
- 改视觉：只改 style.css Tokens 与组件层，禁止散落魔法值。
- 改行为后验证：`node --check` 各 js → `node scripts/update-promos.mjs` → 预览 + 浏览器
  桌面 / 移动走查（搜索、筛选、编辑导出、主题、锚点）。
- `data/promos.js` 自动生成勿手改；临时探测 / E2E 脚本（_probe*.mjs、_e2e.mjs、_shots/）不入库。

## 待决项

- 邀请码 / 评测发布状态（2026-11-16）：16/16 评测已撰写，经两轮导出发布链入库（第一轮 12 篇，第二轮补齐 4 篇）；
  邀请码 kimi 32ZXQF、loomy M6GJWM（loomy 限一人使用，被用后需换码重发布）；
  邀请链接 GLM / TRAE / Qoder / 小浣熊 / WorkBuddy / OpenDesign 已发布。
- kimi 非官方域名 kimi-bot.com 邀请链接经用户确认移除；站长浏览器旧草稿会在下次导出时带回该链接与
  qoder 未加注文案（localStorage 草稿覆盖已发布字段）——发布后应在 ?edit=1 点「恢复已发布版本」清草稿，
  每次导出后需核对这两处。
- qoder 邀请福利为 8月3日-9月3日 已结束活动，页面文案已加注「该活动已结束，当前福利以官网为准」。
- Loomy 官网直连不稳定（部分网络 ECONNRESET / 超时）：入口保留 loomy.xfyun.cn 并加提示；
  若站长确认正式域名，改 sites.js 的 url / promoSources。
- MiMo / Open Design 免费额度：官网动态页未公示，待公开后人工补核并更新 checkedAt。