# 08 技术实现（Web）

> 《不烧心夜市挑战》策划案 · v0.1
> 上游：[04-出摊阶段](04-出摊阶段.md)、[07-数据表结构](07-数据表结构.md)

这是一个 **Web 项目**（浏览器运行、后续可 PWA 离线）。本作的技术难点不在画面，而在：**12000 tick 的实时模拟必须够快、够稳、可复现、可测试**。

---

## 1. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 构建 | Vite + TypeScript（strict） | 启动快、HMR 好、生态稳 |
| UI 层（备货/备餐/结算/局外） | React + CSS（或 Tailwind） | 大量表单、列表、面板，DOM 最省事 |
| 出摊表现层 | PixiJS（WebGL，2D） | 60 秒 200 tick/s、几十个并发精灵，DOM 撑不住 |
| 状态管理 | 自研 `core-sim` + Zustand 做 UI 订阅 | 模拟核心不能被框架绑死 |
| 数值配置 | xlsx → JSON（构建期转换） | 策划改表即生效，见 [07](07-数据表结构.md) §13 |
| 测试 | Vitest | 纯函数核心，单测成本低 |
| 存档 | IndexedDB（优先）/ localStorage（兜底） | 存档体积小，但需要版本迁移 |

**不引入**：游戏引擎（Unity/Godot 的 Web 导出体积大、迭代慢）、后端（纯前端单机，存档本地）。

---

## 2. 分层架构

```
src/
├─ core/                  ← 纯 TS，零 DOM 依赖，可 node 里跑
│  ├─ sim/                出摊阶段 tick 模拟（顾客、队列、成交）
│  ├─ phases/             备货/备餐的命令处理
│  ├─ rules/              词条效果、风味衰减、评分、定价弹性
│  ├─ rng.ts              可复现随机（种子）
│  └─ types.ts            state 形状
├─ data/                  xlsx 导出的 JSON + 加载器
├─ render/                PixiJS 舞台、精灵、飘字、插值
├─ ui/                    React 面板（备货/备餐/结算/局外）
├─ store/                 状态容器 + 订阅桥
└─ main.ts
```

**铁律**：`core/` 里不允许出现 `Math.random`、`Date.now`、`window`、`requestAnimationFrame`。所有随机走 `rng.next()`，所有时间由外部传入。这条保证了三件事：可复现（回放 Bug）、可测试（无头跑一局）、可加速（跑 100 局做数值验证）。

---

## 3. 出摊阶段的时间驱动

```ts
// 固定时间步 + 追帧上限，避免后台切回来一次跑几万 tick
const TICKS_PER_SECOND = 200
let acc = 0
function frame(dtMs: number) {
  acc += dtMs * (speed) * TICKS_PER_SECOND / 1000
  let budget = MAX_TICKS_PER_FRAME          // 例如 400
  while (acc >= 1 && budget-- > 0) {
    sim.step()                              // 推进 1 tick
    acc -= 1
  }
  if (budget <= 0) acc = 0                  // 丢弃积压，防止雪崩
  renderer.draw(acc)                        // acc ∈ [0,1) 用于插值
}
```

| 参数 | 值 | 说明 |
|---|---|---|
| `TICKS_PER_SECOND` | 200 | 策划案固定值 |
| `sim.step()` 总次数 | 12000 | 60 秒 × 200 |
| 1x 下每帧 tick 数 | ≈ 3.33（60fps） | |
| `MAX_TICKS_PER_FRAME` | `[待定: 400]` | 卡顿时最多补 400 tick，其余丢弃 |
| 单 tick 预算 | < 0.05 ms | 12000 tick 全程 < 600 ms CPU，摊到 60 秒无压力 |

- **切后台**：`document.visibilitychange` 时暂停累加，回来不追帧（否则会瞬间跑完）。可选：弹"已暂停"提示。
- **加速**：`speed ∈ {1,2}`，只改 `acc` 的增长速率，不改模拟结果。

---

## 4. 确定性与可回放

1. **种子随机**：`seed = hash(runId, day)`，`mulberry32` 或 `xorshift128`。每天开盘派生独立流（供应商、事件、顾客各有子流），改一处不影响别的流。
2. **事件顺序**：同一 tick 内的事件按 `(tick, seq)` 排序执行，禁止依赖 Map 迭代顺序。
3. **浮点**：核心结算用整数 + 定点（金钱用整数分/元，风味用 0~10000 整数），避免跨浏览器浮点差异。
4. **回放**：记录 `{seed, 玩家操作列表(tick, action)}` 即可完整复现一局，用于复现玩家报的 Bug。存档里存这个而不是存全量 state 也更省，但为了方便读档，**两者都存**（state 快照 + 操作日志）。

---

## 5. 状态形状（示意）

```ts
interface GameState {
  meta: { runId: string; day: number; seed: number; skills: SkillState; unlocks: string[] }
  cash: number
  phase: 'STOCK' | 'PREP' | 'SELL' | 'SETTLE' | 'META'
  stock: { minutesLeft: number; suppliers: SupplierState[]; pendingOrders: Order[] }
  prep: {
    minutesLeft: number
    menu: MenuEntry[]                       // { foodId, price, servings, freshness[], onMenu }
    inventory: Record<string, { stage: Stage; qty: number }>
    utensils: UtensilState[]
    surfaceUsed: number; storageUsed: number
    activeTraits: Record<string, number>    // traitId -> layer X
  }
  sell: {
    tick: number
    customers: CustomerState[]
    queues: Record<string, QueueItem[]>     // utensilId -> 队列
    layers: Record<string, number>
    sales: SaleLog[]
    stats: { revenue: number; served: number; lost: number; complaints: number }
  }
}
```

**关键点**：`activeTraits` / `layers` 的层数在出摊中**实时变化**，UI 必须每 tick 可读；因此层数存在 `sell.layers`，出摊结束才归档到统计。

---

## 6. 备货 / 备餐：命令式

这两个阶段是非实时的，用命令 + 纯 reducer：

```ts
type Cmd =
  | { t: 'buy_onsite'; supplierId: string; sku: string; qty: number }
  | { t: 'order_online'; supplierId: string; sku: string; qty: number }
  | { t: 'menu_toggle'; foodId: string }
  | { t: 'set_price'; foodId: string; price: number }
  | { t: 'process'; ingredientId: string; fromStage: Stage; qty: number }
  | { t: 'collect_bonus'; buffId: string }

function reduce(state: GameState, cmd: Cmd): GameState   // 返回新状态，不就地改
```

好处：所有操作可被校验/撤销/重放；UI 层只负责发命令和渲染结果。菜单与定价不消耗时间（[03](03-备餐阶段.md) §1），所以这两类命令是免费的纯规划操作，可以随意重放。

---

## 7. 渲染

| 项 | 做法 |
|---|---|
| 舞台 | 固定逻辑分辨率（如 1280×720）+ 等比缩放，适配任意窗口 |
| 精灵 | 顾客/餐品/厨具用图集，对象池复用（一局最多 `[待定: 200]` 个顾客对象） |
| 飘字 | 独立容器，每 tick 只生成增量，动画由渲染侧按帧推进 |
| 数字滚动 | UI 侧用补间，不参与模拟 |
| 层级 | 背景 → 摊位 → 厨具 → 餐品 → 顾客 → 飘字 → HUD |
| 性能目标 | 中端手机 60fps；同屏精灵 ≤ `[待定: 150]` |
| 音频 | 首次用户手势后解锁 AudioContext；BGM + 音效池 |

出摊段的视觉反馈请求见 [04](04-出摊阶段.md) §10、[09](09-界面与交互流程.md)。

---

## 8. 存档

| 项 | 方案 |
|---|---|
| 时机 | 每个阶段切换、每次加成选择、出摊结束 |
| 内容 | `{version, state, cmdLog, seed, rngState, savedAt}` |
| 位置 | IndexedDB 单键；localStorage 兜底（state 小于 `[待定: 200KB]` 时） |
| 迁移 | `version` + 迁移函数链 `v1→v2→v3`；关键字段缺失时补默认值而不是崩 |
| 多存档 | 单档位（一局 7 天，不需要多档）；局外进度独立存 `meta` |
| 防作弊 | 不做。单机增量游戏，改存档是玩家自由 |

---

## 9. 测试与调参

| 需求 | 做法 |
|---|---|
| 模拟正确性 | 对 `sim.step()` 写单测：给定种子 + 固定输入，断言 12000 tick 后的营业额/成交数/层数 |
| 词条公式 | 参数化测试：`X=0/1/50/151` 时各词条效果值符合公式 |
| 无头批量跑 | Node 脚本跑 N=1000 局不同种子，输出分布（营业额、评分、峰值排队），用于找"必输局/必赢局" |
| 数值回归 | 改动数值表后跑同一组种子，对比关键指标变化百分比 |
| 确定性 | 同一 `{seed, cmdLog}` 连跑两次，state 哈希必须相等 |

**建议的调参仪表盘**（可后置）：一个隐藏页面，滑块改 `CFG_Balance` 的关键参数，直接看 100 局模拟的指标分布 —— 比手填表快得多。

---

## 10. 里程碑（建议拆分）

| 里程碑 | 内容 | 验收 |
|---|---|---|
| M0 骨架 | Vite + TS + 数据加载 + 状态容器 + 空三阶段切换 | 能在三个阶段间走完一天 |
| M1 最小闭环 | 现场采购 → 上架 → 定价 → 出摊（含最简顾客与出餐）→ 结算 | 能玩完 1 天并看到营业额 |
| M2 词条系统 | 属性/上架款数/层数/特性/飘字 | 3 款速食能看到速度为王激活且出餐变快 |
| M3 完整 7 天 | 事件、QTE、加成、评分→客流、局外技能 | 能跑完 7 天并进入下一轮 |
| M4 表现打磨 | PixiJS 场景、飘字、演出、音效、移动端适配 | 60fps 稳定 |
| M5 数值与内容 | 补全食材/供应商/菜谱，跑批量模拟收敛 | 1000 局指标分布符合 [05](05-评分与养成.md) §7 |

M1 之前不要碰美术；M2 是核心乐趣所在，优先于一切打磨。

---

## 11. 目录与工具

- 配置表源文件建议放进 `data-src/*.xlsx`，导出到 `src/data/*.json`，并在 CI 里跑校验脚本。
- `tools/` 下三个脚本：`xlsx2json.py`（转换+校验）、`simulate.ts`（无头跑批）、`balance.ts`（仪表盘数据）。
- 本仓库当前只有 `food.xlsx` / `buff.xlsx` / `gameset.md`，代码尚未初始化 —— 建议 M0 时创建 `src/`、`tools/`、`data-src/` 并把两个 xlsx 移入 `data-src/`（移动前先备份）。

---

## 12. 尚未确定的技术决策

- [ ] 是否要做移动端优先（横屏）还是桌面优先 → 影响布局与操作方式（QTE 的点击精度）
- [ ] QTE 是否需要触屏/键鼠双方案
- [ ] 数值表最终形态：单一 xlsx 多 sheet，还是多文件
- [ ] 是否需要 i18n（当前全中文，先不做）
- [ ] 是否 PWA 离线包

---

[← 返回索引](../gameset.md)
