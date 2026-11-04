# sound/ — BGM 放这里

游戏会按阶段播放这 4 个文件（文件名必须一致）：

| 文件名 | 阶段 |
|---|---|
| `C418 - Aria Math.mp3` | 主菜单 / 局外 |
| `ConcernedApe - Spring (Wild Horseradish Jam).mp3` | 备货 |
| `ConcernedApe - Summer (Nature's Crescendo).mp3` | 备餐 |
| `C418 - Moog City 2.mp3` | 出摊 / 结算 |

## 为什么这个目录不在仓库里

这些曲子是商业作品（C418、ConcernedApe），**没有随代码分发**。
`sound/` 已加入 `.gitignore`，请自行准备有授权的音频文件放进这个目录。

## 没有音乐也能玩

音频加载失败会静默降级，游戏逻辑与画面完全不受影响。
想换成自己的曲子，改 `src/audio.js` 顶部的 `TRACKS` 即可：

```js
const TRACKS = {
  menu:  'sound/你的曲子.mp3',
  stock: 'sound/...',
  prep:  'sound/...',
  sell:  'sound/...',
};
```

## 音量

HUD 右上角的「音 / 静」按钮切换静音，偏好存在
`localStorage['bushaoxin.audio']`。
