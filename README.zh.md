# Countdown Day 倒数纪念日

[English](README.md)

一个 [Obsidian](https://obsidian.md) 插件：以列表视图管理倒数日与纪念日，完整支持**公历与农历**（含闰月）。

<p align="center">
  <img src="docs/screenshots/view-zh-1.png" width="49%" alt="view1">
  <img src="docs/screenshots/view-zh-2.png" width="49%" alt="view2">
</p>

## 功能

- **列表视图**：每个事件一行（名称、日期 + 农历、大号倒数天数），最近优先；置顶最前，已过期沉底弱化；分类筛选（全部/倒计时/纪念日/生日）。桌面文字按钮，触屏左滑操作。
- **弹层式交互**：移动端底部弹层、桌面居中弹框；日期选择桌面为月历网格、移动端为滚轮；公历/农历点选自动换算，选不出无效日期。
- **重复规则**：永不/每天/工作日/每周/每月/每年/自定义间隔（每 N 天）；农历每年重复在无闰月、无三十的年份自动落位。
- **事件即笔记**：每个事件一个 markdown 文件（默认 `Countdowns/`），frontmatter 即数据；表单或手写皆可，视图实时同步。
- **任意嵌入**：用 `countdown` 代码块把事件行嵌入任何笔记。
- **提前提醒**：提前天数多选；桌面系统通知（拒绝权限回退 Notice，移动端用 Notice），同一发生日的同一提前天数只提醒一次。
- **中英双语**，跟随 Obsidian 语言设置。

## 用法

### 新建事件

点 ribbon 图标（calendar-clock）或命令面板 _“Countdown Day: 倒数纪念日”_ 打开视图，点右下角 **+** 填表保存。

### 嵌入笔记

````markdown
```countdown
type: birthday, anniversary
limit: 5
```
````

| 选项    | 格式               | 默认 | 说明           |
| ------- | ------------------ | ---- | -------------- |
| `type`  | 逗号分隔的类型列表 | 全部 | 按事件类型筛选 |
| `limit` | 正整数             | 不限 | 只显示前 N 个  |

### 提醒

在事件上多选**提醒天数**。当今天恰好是发生日的某个所选提前天数时触发一次通知——启动时、每 10 分钟、事件变更时检查；同一发生日的同一提前天数只提醒一次。

### 设置

- **事件文件夹**：事件文件所在文件夹（默认 `Countdowns/`），首次新建事件时自动创建。

### 事件文件格式

文件名 = 事件名；正文 = 自由备注。frontmatter 字段（未知字段原样保留）：

| 字段           | 取值                                                                       | 默认    | 说明                                        |
| -------------- | -------------------------------------------------------------------------- | ------- | ------------------------------------------- |
| `type`         | `countdown` / `anniversary` / `birthday`                                   | 必填    | 事件类型                                    |
| `date`         | `yyyy-MM-dd`                                                               | 必填    | 事件日期（农历事件为农历月/日）             |
| `calendar`     | `solar` / `lunar`                                                          | `solar` | `date` 的历法（农历：1900–2100 年，含闰月） |
| `leap-month`   | 布尔                                                                       | `false` | 仅农历：该月为闰月                          |
| `repeat`       | `none` / `daily` / `weekdays` / `weekly` / `monthly` / `yearly` / `custom` | `none`  | 重复规则                                    |
| `repeat-every` | 整数 ≥ 1                                                                   | —       | 仅 `custom`：每 N 天                        |
| `note`         | `"[[笔记]]"`                                                               | —       | 关联笔记                                    |
| `remind`       | 整数或列表 ≥ 0                                                             | —       | 提前提醒天数，`0` = 当天                    |
| `pinned`       | 布尔                                                                       | `false` | 置顶                                        |

```yaml
---
type: birthday
date: 1985-06-08
calendar: lunar
repeat: yearly
note: "[[家人]]"
remind: [0, 3]
pinned: true
---
这里写你的备注。
```

## 安装

在插件进入社区市场前：

1. 从 [最新 Release](../../releases) 下载 `main.js`、`manifest.json`、`styles.css`。
2. 放入 `<vault>/.obsidian/plugins/countdown-day/`。
3. 在 设置 → 第三方插件 中启用 "Countdown Day"。

## 开发

```bash
npm install
npm run dev     # 监听构建
npm test        # vitest
npm run build   # 类型检查 + 生产构建
```

## 许可

[MIT](LICENSE)
