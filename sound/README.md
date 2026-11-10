# sound/ — BGM

游戏会按阶段播放曲目，文件名必须与 `src/data/tracks.json` 一致。

## 曲目与出处

| 文件名 | 曲名 | 作曲 | 来源作品 | 使用阶段 |
|---|---|---|---|---|
| `ConcernedApe - Spring (Wild Horseradish Jam).mp3` | Spring (Wild Horseradish Jam) | ConcernedApe（Eric Barone） | 《星露谷物语》(Stardew Valley) OST | 备货 |
| `ConcernedApe - Summer (Nature's Crescendo).mp3` | Summer (Nature's Crescendo) | ConcernedApe（Eric Barone） | 《星露谷物语》(Stardew Valley) OST | 备餐 |
| `C418 - Aria Math.mp3` | Aria Math | C418（Daniel Rosenfeld） | 《我的世界》(Minecraft) Volume Beta | 主菜单 |
| `C418 - Moog City 2.mp3` | Moog City 2 | C418（Daniel Rosenfeld） | 《我的世界》(Minecraft) Volume Beta | 出摊 / 结算 |

**版权归原作者所有。** 本项目仅为武汉大学 2026「零杯」网页设计大赛的参赛作品，**非商业用途**，
在此按合理使用原则引用，并在此明确标注出处。若权利人提出异议，将立即移除相关音频。

## 分发范围

- **仓库本身不含任何音频**：`sound/*.mp3` 在 `.gitignore` 里，源码仓库只提供这张曲目表。
- **`-含BGM` 提交包**内附上表中 ConcernedApe 的两首（Spring / Summer），仅供本次赛事评审试听。
  C418 的两首**任何包都不含**，播放器会自动跳过缺失文件。

## 没有音乐也能玩

音频加载失败会静默降级，游戏逻辑与画面完全不受影响。

想换成自己的曲子：把文件放进本目录，再改 `src/data/tracks.json`：

```json
[
  { "file": "sound/你的曲子.mp3", "title": "曲名", "artist": "作者", "phase": "stock" }
]
```

`phase` 可取 `menu` / `stock` / `prep` / `sell`。

## 播放器

底栏右侧是播放器：上一首 / 播放暂停 / 下一首、是否跟随阶段、曲目下拉、音量。
HUD 右上角的「音」按钮是静音开关。偏好存在 `localStorage['bushaoxin.audio']`。
