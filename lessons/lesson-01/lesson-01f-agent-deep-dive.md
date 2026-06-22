# 🧠 Lesson 01f：agent/ 文件夹——整个项目的心脏

> 如果说前面的 config、tools、chat 都是"零件"，那 `agent/` 就是**把这些零件组装成"智能"的地方**。
>
> 这整个文件夹就两个文件：
> - **`types.ts`**（16 行）—— Agent 的"名片"：它接受什么配置、它有什么状态、它能报告什么信息
> - **`index.ts`**（152 行）—— Agent 的"大脑"：核心就是 `chat()` 方法里的那个 while 循环
>
> 我们先看名片，再看大脑。

---

## 目录

- [第一章：先看全景——agent/ 在项目中的位置](#第一章先看全景agent-在项目中的位置)
- [第二章：types.ts——Agent 的"名片"](#第二章typestsagent-的名片)
   - [2.1 AgentConfig——给 Agent 的"入职登记表"](#21-agentconfig给-agent-的入职登记表)
   - [2.2 AgentState——Agent 的"当前状态"](#22-agentstateagent-的当前状态)
   - [2.3 AgentStatus——Agent 的"体检报告"](#23-agentstatusagent-的体检报告)
   - [2.4 为什么 types.ts 这么短还要单独一个文件？](#24-为什么-typests-这么短还要单独一个文件)
- [第三章：index.ts——Agent 的大脑（152 行核心）](#第三章indextsagent-的大脑152-行核心)
   - [3.1 类的结构总览](#31-类的结构总览)
   - [3.2 构造函数——"装脑子"](#32-构造函数装脑子)
   - [3.3 `chat()` 方法——Agent Loop 的完整拆解](#33-chat-方法agent-loop-的完整拆解)
      - [3.3.1 Step 1：记录用户输入](#331-step-1记录用户输入)
      - [3.3.2 Step 2：调用 LLM（complete）](#332-step-2调用-llmcomplete)
      - [3.3.3 Step 3：处理 LLM 错误](#333-step-3处理-llm-错误)
      - [3.3.4 Step 4：构建 assistant 消息](#334-step-4构建-assistant-消息)
      - [3.3.5 Step 5：判断是否退出循环](#335-step-5判断是否退出循环)
      - [3.3.6 Step 6：执行工具](#336-step-6执行工具)
      - [3.3.7 Step 7：把工具结果塞回去，继续循环](#337-step-7把工具结果塞回去继续循环)
      - [3.3.8 10 轮上限——为什么要有个"保险丝"？](#338-10-轮上限为什么要有个保险丝)
   - [3.4 辅助方法：getStatus、getHistory、clear](#34-辅助方法getstatusgethistoryclear)
- [第四章：全链路跟练——一次 chat() 调用的完整旅行](#第四章全链路跟练一次-chat-调用的完整旅行)
- [第五章：types.ts 和 index.ts 是怎么配合的？](#第五章typests-和-indexts-是怎么配合的)

---

# 第一章：先看全景——agent/ 在项目中的位置

```
用户输入 "list files"
       │
       ▼
┌──────────────────┐
│    Chat          │  （已讲过）
│  等用户输入       │
│  打印回复         │
└────────┬─────────┘
         │ this.agent.chat("list files")
         ▼
┌──────────────────────────────────────────────────────┐
│    Agent ═══════════════════════════════════════════ │  ← 我们在这
│                                                      │
│  ┌─ index.ts ──────────────────────────────────────┐ │
│  │                                                 │ │
│  │  class Agent {                                  │ │
│  │    chat(input) {                                │ │
│  │      while (turn < 10) {         ← Agent Loop  │ │
│  │        client.complete(...)  ──→  调用 LLM      │ │
│  │        if (有工具要调) {                         │ │
│  │          tool.execute(...)   ──→  执行工具       │ │
│  │          → 继续循环                              │ │
│  │        } else {                                 │ │
│  │          return 文本               ← 返回结果   │ │
│  │        }                                        │ │
│  │      }                                          │ │
│  │    }                                            │ │
│  │  }                                              │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ types.ts ──────────────────────────────────────┐ │
│  │                                                 │ │
│  │  AgentConfig   →  new Agent(时传入配置)          │ │
│  │  AgentState    →  "idle" | "thinking"            │ │
│  │  AgentStatus   →  { state, messageCount }        │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│   LLMClient      │     │   tools/         │
│   完整()         │     │   findTool()     │
│   发 HTTP 请求   │     │   buildDefs()    │
└──────────────────┘     └──────────────────┘
```

---

# 第二章：types.ts——Agent 的"名片"

**完整文件（16 行）：**

```typescript
import type { Message } from "../llm/types.js";
import type { Tool } from "../tools/types.js";

export interface AgentConfig {
  systemPrompt: string;
  tools?: Tool[];
}

export type AgentState = "idle" | "thinking";

export interface AgentStatus {
  state: AgentState;
  messageCount: number;
}
```

这个文件定义了 Agent **"是什么"、"需要什么"、"能报告什么"**。

## 2.1 AgentConfig——给 Agent 的"入职登记表"

```typescript
export interface AgentConfig {
  systemPrompt: string;     // Agent 的"人设"
  tools?: Tool[];           // Agent 能用的工具（可选）
}
```

**`AgentConfig` 就是创建 Agent 时要填的"入职表"：**

| 字段 | 类型 | 必填？ | 含义 | 类比 |
|------|------|--------|------|------|
| `systemPrompt` | `string` | ✅ 必填 | Agent 的行为准则 | 员工手册 |
| `tools` | `Tool[]` | ❌ 可选 | Agent 能用的工具列表 | 工具箱 |

**在哪里被使用的？**

在 `src/index.ts` 创建 Agent 时：

```typescript
const agent = new Agent(client, {
  systemPrompt:
    "You are a helpful coding assistant. " +
    "You have access to a bash tool that can execute shell commands. " +
    "Use it when needed to help the user. Answer concisely.",
  tools: ALL_TOOLS,    // ← [bashTool]
});
```

**`tools?` 后面的 `?` 是什么意思？**

`tools?: Tool[]` 表示这个属性**可以没有**。如果你不给 `tools`，Agent 也能创建：

```typescript
// ✅ 不传 tools 也可以
const agent = new Agent(client, {
  systemPrompt: "You are a helpful assistant.",
  // 没有 tools 字段
});

// Agent 构造时：
this.tools = config.tools || [];  // → config.tools 是 undefined → this.tools = []
```

**哦，原来 `?` 就是"可选"的意思，对应 Java 里你可以在构造的时候传 null。** 但在 TS 里，`?` 让你在语法层面就可以不传这个字段。

### `import type { Tool }`——为什么 tools/types.ts 的类型会出现在这里？

```typescript
// agent/types.ts
import type { Tool } from "../tools/types.js";

export interface AgentConfig {
  tools?: Tool[];        // ← 用到了 tools/types 里的 Tool 类型
}
```

**`AgentConfig` 使用了 `Tool` 类型。** 但它不需要知道 `Tool` 是怎么实现的——它只要知道"有一个叫 Tool 的类型"就够了。

这就是 `import type` 的典型场景：

```
agent/types.ts 依赖 tools/types.ts 的"类型"
                           ↑ 纯类型，编译后消失
                           不依赖 tools/bash.ts 的"运行时代码"
```

## 2.2 AgentState——Agent 的"当前状态"

```typescript
export type AgentState = "idle" | "thinking";
```

这是 TypeScript 中的**字符串字面量联合类型（String Literal Union Type）**。

**什么意思？**

`AgentState` 类型的变量**只能取两个值之一**：

```typescript
let state: AgentState;

state = "idle";      // ✅ 正确
state = "thinking";  // ✅ 正确
state = "busy";      // ❌ 报错！Type '"busy"' is not assignable to type 'AgentState'
state = "sleeping";  // ❌ 报错！
state = 123;         // ❌ 报错！number 不能赋值给 string 类型
```

**这比普通字符串有什么好处？**

```typescript
// ❌ 不用类型约束时的写法
let state: string;
state = "idle";     // ✅ 但也可以
state = "idleee";   // ✅ 不会报错！运行时才发现拼写错误

// ✅ 用类型约束后的写法
let state: AgentState;
state = "idle";     // ✅
state = "idleee";   // ❌ 编译时就报错！TypeScript 帮你提前发现拼写错误
```

> **对应 Java**：类似 `enum AgentState { IDLE, THINKING }`。但在 TS 中，用 `type` + 字面量联合更轻量，不需要 `enum` 关键字。

**`type` 和 `interface` 的区别再次体现：**

```typescript
// type 适合"要么是这个值要么是那个值"的场景
export type AgentState = "idle" | "thinking";

// 如果用 interface 表示不了——interface 只能描述对象结构
```

**AgentState 在代码中怎么流转的？**

```
Agent 对象创建 → state = "idle"
     ↓
用户输入 → chat() 被调用 → state = "thinking"
     ↓
处理完成 → 返回结果 → state = "idle"
     ↓
Chat 可以随时通过 getStatus() 查看当前 state
```

## 2.3 AgentStatus——Agent 的"体检报告"

```typescript
export interface AgentStatus {
  state: AgentState;       // 当前状态："idle" | "thinking"
  messageCount: number;    // 对话历史的消息数量
}
```

**在 chat/index.ts 中怎么用的：**

```typescript
// chat/index.ts 第 54-55 行
const status = this.agent.getStatus();
console.log(`[status: ${status.state}, messages: ${status.messageCount}]`);

// 输出示例：
// [status: idle, messages: 3]
// [status: thinking, messages: 4]
```

它让 Chat 层可以在**每次对话前**先看一眼 Agent 的"仪表盘"。

> **这其实就是"面向对象设计中的信息隐藏"**：Agent 内部有 `messages[]` 整个数组，但 Chat 不需要知道全部——它只需要知道"有多少条消息"。`AgentStatus` 就是 Agent 选择暴露给外界的"最小信息"。

## 2.4 为什么 types.ts 这么短还要单独一个文件？

这个问题问得好！才 16 行，为什么不直接写在 `index.ts` 里？

**三个理由，一个比一个重要：**

### 理由 1：避免"鸡生蛋蛋生鸡"的循环引用

```typescript
// 假设类型定义在 index.ts 里：
// agent/index.ts
export interface AgentConfig { ... }   // ← 类型
export class Agent { ... }              // ← 逻辑

// 如果 chat/index.ts 只想引用 AgentConfig 类型：
import { AgentConfig } from "../agent/index.js";
// ↑ 这一行会加载整个 agent/index.ts！包括 Agent 类的全部代码
```

把类型分离到 `types.ts` 后：

```typescript
// chat/index.ts
import type { AgentConfig } from "../agent/types.js";
// ↑ 只加载类型，不加载 Agent 类的代码
// 编译后这一行完全消失！
```

### 理由 2：作为"数据字典"一目了然

```typescript
// 打开 agent/types.ts，三秒就知道 Agent 模块定义了哪些"数据概念"
export interface AgentConfig { ... }  // → 配置长这样
export type AgentState = ...          // → 状态只有两种
export interface AgentStatus { ... }  // → 报告包含这些信息
```

### 理由 3：类型可能被多个地方引用

```typescript
// AgentConfig 被谁用了？
// 1. agent/index.ts —— Agent 构造函数接收它
// 2. src/index.ts —— 创建 Agent 时传入它
// 3. 以后测试文件 —— 测试时需要构造 mock 配置

// 如果类型写在 index.ts 里，以上所有地方都要 import 整个 index.ts
// 如果类型写在 types.ts 里，以上所有地方只 import types.ts
```

> **总结**：types.ts 是"数据定义"，index.ts 是"逻辑实现"。分成两个文件后，**想用类型的人不用加载逻辑代码**，**想改逻辑的人不会被类型定义干扰**——各取所需。

---

# 第三章：index.ts——Agent 的大脑（152 行核心）

## 3.1 类的结构总览

```typescript
export class Agent {
  // ── 私有字段（5 个）──
  private client: LLMClient;       // LLM 客户端
  private systemPrompt: string;    // 系统提示词
  private messages: Message[];     // 对话历史
  private state: AgentState;       // 当前状态
  private tools: Tool[];           // 可用工具

  // ── 构造函数 ──
  constructor(client: LLMClient, config: AgentConfig)

  // ── 公开方法（4 个）──
  async chat(userInput: string): Promise<string>   // 🎯 核心！
  getStatus(): AgentStatus                          // 查状态
  getHistory(): readonly Message[]                  // 查历史
  clear(): void                                     // 清空历史
}
```

### 用"大脑"来比喻

```
Agent 类 = 一个人的大脑

私有字段：
  client        → 语音系统（能说话、能听见）
  systemPrompt  → 核心价值观（"我是一个乐于助人的助手"）
  messages      → 短期记忆（刚才说了什么）
  state         → 当前精神状态（"空闲"/"思考中"）
  tools         → 双手（能做什么事）

公开方法：
  chat(input)   → "你跟我说一句话，我思考后回答你"（核心能力）
  getStatus()   → "你问我状态怎么样"
  getHistory()  → "你问我刚才说了什么"
  clear()       → "你让我忘掉所有事情"
```

### 五个私有字段的"生命周期"

| 字段 | 什么时候赋值的 | 值会变吗 | 什么时候变 |
|------|--------------|---------|-----------|
| `client` | 构造函数 | ❌ 不变 | — |
| `systemPrompt` | 构造函数 | ❌ 不变 | — |
| `messages` | 构造函数设为 `[]` | ✅ 会变 | 每次 `chat()` 都会增加 |
| `state` | 构造函数设为 `"idle"` | ✅ 会变 | `chat()` 开始时变 `"thinking"`，结束时变 `"idle"` |
| `tools` | 构造函数（`config.tools \|\| []`） | ❌ 不变 | — |

**两个不变（client、systemPrompt、tools），两个会变（messages、state）。**

## 3.2 构造函数——"装脑子"

```typescript
constructor(client: LLMClient, config: AgentConfig) {
  this.client = client;
  this.systemPrompt = config.systemPrompt;
  this.messages = [];                    // 初始：空的对话历史
  this.state = "idle";                   // 初始：空闲状态
  this.tools = config.tools || [];       // 初始：传入的工具列表（或空数组）
}
```

### 依赖注入模式

```typescript
constructor(client: LLMClient, config: AgentConfig)
//              ↑                        ↑
//           LLM 客户端              配置对象
//           （从外面传入）          （从外面传入）
```

**Agent 自己不创建任何东西**——`client` 是外面传进来的，`config` 也是外面传进来的。这叫**依赖注入**。

对比"坏"的写法：

```typescript
// ❌ 坏设计：Agent 自己创建依赖
class Agent {
  private client: LLMClient;

  constructor() {
    const config = loadConfig();    // Agent 自己读配置
    this.client = new LLMClient(config);  // Agent 自己创建客户端
  }
  // → 测试时没法 mock！Agent 硬编码了真实的 LLMClient
}

// ✅ 好设计：依赖从外面注入
class Agent {
  private client: LLMClient;

  constructor(client: LLMClient, config: AgentConfig) {
    this.client = client;  // 别人创建好传进来
  }
  // → 测试时可以传一个 mock 的 LLMClient！
}
```

### `config.tools || []` 这个写法

```typescript
this.tools = config.tools || [];
```

**这句话在做什么？**

```typescript
// 如果 config.tools 有值 → 用 config.tools
// 如果 config.tools 是 undefined / null → 用空数组 []

// 等价于：
if (config.tools !== undefined && config.tools !== null) {
  this.tools = config.tools;
} else {
  this.tools = [];
}
```

**为什么需要这个？** 因为 `AgentConfig` 里 `tools` 是可选的（`tools?: Tool[]`），所以 `config.tools` 可能是 `undefined`。如果直接 `this.tools = config.tools`，那 `this.tools` 也可能是 `undefined`——后面用到 `this.tools` 的地方都要加判断。用 `|| []` 后，`this.tools` 一定是一个数组（可能是空的）。

## 3.3 `chat()` 方法——Agent Loop 的完整拆解

这是整个项目**最核心的 88 行代码**（第 49-136 行）。我们按顺序拆开。

### 3.3.1 Step 1：记录用户输入

```typescript
async chat(userInput: string): Promise<string> {
  this.state = "thinking";                                    // ①

  this.messages.push({ role: "user", content: userInput });  // ②
```

**① `this.state = "thinking"`**

把状态从 `"idle"` 切换成 `"thinking"`。这就是 Chat 层调用 `getStatus()` 能看到状态的原理。

**② `this.messages.push(...)`**

把用户的输入**追加到对话历史末尾**。

`push` 是 JavaScript 数组的方法，在末尾添加一个元素：

```typescript
// messages 原来是：
[ { role: "assistant", content: "你好！有什么可以帮你的？" } ]

// push 之后：
[ { role: "assistant", content: "你好！有什么可以帮你的？" },
  { role: "user", content: "list files" } ]    ← 新增
```

> **对应 Java**：`list.add(new Message("user", "list files"));`
> **对应 Python**：`messages.append({"role": "user", "content": "list files"})`

### 3.3.2 Step 2：调用 LLM（complete）

```typescript
  let turn = 0;
  const maxTurns = 10;

  while (turn < maxTurns) {                // ③
    turn++;

    const toolDefs = buildToolDefinitions(); // ④

    const result: LLMResult = await this.client.complete(  // ⑤
      this.systemPrompt,                                    // ⑥
      this.messages,                                        // ⑦
      toolDefs.length > 0 ? toolDefs : undefined            // ⑧
    );
```

**③ `while (turn < maxTurns)`**

循环最多 10 次。`turn` 从 1 开始计数（因为先 `turn++` 再进循环体），`maxTurns = 10`。

**④ `const toolDefs = buildToolDefinitions()`**

调用 tools/index.ts 的函数，把所有工具转换成 LLM 能理解的"说明书"格式。

返回的是：
```typescript
[
  {
    name: "bash",
    description: "Execute a shell command...",
    input_schema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] }
  }
]
```

**⑤ `await this.client.complete(...)`**

**这是 Agent Loop 中最核心的一次 `await`。** 程序在这里暂停，等待 LLM 回复。

**⑥ 第一个参数：`this.systemPrompt`**

传给 LLM 的"行为准则"。LLM 在生成回复时会参考这个。

**⑦ 第二个参数：`this.messages`**

把**整个对话历史**发给 LLM。所以历史越长，请求越大，花钱越多。

**⑧ 第三个参数：`toolDefs.length > 0 ? toolDefs : undefined`**

这个三元表达式的意思是："如果有工具定义，就传给 LLM；如果没有工具，就不传。"

```typescript
// 等价于：
if (toolDefs.length > 0) {
  // 有工具 → 让 LLM 知道可以用工具
  this.client.complete(systemPrompt, messages, toolDefs);
} else {
  // 没有工具 → 不传工具定义
  this.client.complete(systemPrompt, messages, undefined);
}
```

### 3.3.3 Step 3：处理 LLM 错误

```typescript
    if (result.kind === "error") {           // ⑨
      this.state = "idle";
      return `[Error] ${result.message}`;
    }
```

**⑨ `result.kind === "error"`**

这里用到了**判别联合**。`LLMResult` 要么是 `LLMResponse`（`kind: "success"`），要么是 `LLMError`（`kind: "error"`）。

`kind === "error"` 时，TypeScript 自动缩窄类型为 `LLMError`，所以可以安全访问 `result.message`。

### 3.3.4 Step 4：构建 assistant 消息

```typescript
    const assistantBlocks: ContentBlock[] = [];
    if (result.content) {                                   // ⑩
      assistantBlocks.push({ type: "text", text: result.content });
    }
    for (const tu of result.toolUses) {                     // ⑪
      assistantBlocks.push({
        type: "tool_use",
        id: tu.id,
        name: tu.name,
        input: tu.input,
      });
    }
    this.messages.push({ role: "assistant", content: assistantBlocks }); // ⑫
```

**⑩ `if (result.content)`**

LLM 可能返回空文本（比如它直接调用工具，没有说话）。

**⑪ `for (const tu of result.toolUses)`**

遍历 LLM 请求的所有工具调用。LLM 可以一次请求调用多个工具（虽然本项目目前只有一个 bash 工具）。

**⑫ `this.messages.push(...)`**

把**整个 assistant 回复**（文本 + 所有工具调用请求）追加到对话历史。

这时 `messages` 变成：
```typescript
[
  { role: "user", content: "list files" },
  { role: "assistant", content: [
      { type: "text", text: "我来帮你查看" },
      { type: "tool_use", id: "tu_xxx", name: "bash", input: { command: "ls" } }
    ]
  }
]
```

### 3.3.5 Step 5：判断是否退出循环

```typescript
    if (result.toolUses.length === 0) {     // ⑬
      this.state = "idle";
      return result.content;                 // ⑭
    }
```

**⑬ `result.toolUses.length === 0`**

如果 LLM 没有请求任何工具调用，说明它已经直接回答了你的问题。

**⑭ `return result.content`**

直接返回 LLM 的文本回复。Agent Loop 结束，`chat()` 方法返回给 Chat 层。

**这是 Agent Loop 最关键的判断：**

```
LLM 有没有请求调用工具？
    │
    ├─ 没有 → LLM 直接回答了 → 返回给用户 ✅
    │
    └─ 有 → 执行工具 → 把结果塞回去 → 再问 LLM → 继续循环
```

### 3.3.6 Step 6：执行工具

```typescript
    const toolResultBlocks: ContentBlock[] = [];
    for (const tu of result.toolUses) {
      const tool = findTool(tu.name);           // ⑮

      if (!tool) {                              // ⑯
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Error: Tool "${tu.name}" not found`,
          is_error: true,
        });
        continue;
      }

      console.log(`[Tool] ${tool.name} ${JSON.stringify(tu.input)}`); // ⑰

      try {
        const output = await tool.execute(tu.input);  // ⑱
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: output,
        });
      } catch (err) {                                  // ⑲
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true,
        });
      }
    }
```

**⑮ `findTool(tu.name)`**

到 tools/index.ts 的工具注册表里找"有没有一个叫这个名的工具"。

**⑯ `if (!tool)`**

万一 LLM 叫了一个不存在的工具（比如叫 `"read_file"` 但你没注册这个工具），不崩——给它返回一个错误消息，LLM 看到后会"哦，这个工具不存在，那我换一个"。

**⑰ `console.log(...)`**

在终端打印 `[Tool] bash {"command":"ls"}`，让用户看到 Agent 正在做什么。

**⑱ `await tool.execute(tu.input)`**

**又一个核心 await。** 真正执行工具，等待它的结果。

**⑲ `try/catch`**

如果工具执行抛异常（比如 `reject` 了），catch 块负责把错误转成友好的字符串，而不是让程序崩溃。

**关键设计**：**工具执行的错误不会终止 Agent Loop**，而是被包装成 `tool_result` 返回给 LLM。LLM 看到错误后，可以自己决定"那我换个命令试试"。

### 3.3.7 Step 7：把工具结果塞回去，继续循环

```typescript
    this.messages.push({ role: "user", content: toolResultBlocks }); // ⑳
  }  // while 循环结束
```

**⑳ `messages.push({ role: "user", content: toolResultBlocks })`**

把工具执行结果**以 `role: "user"` 的身份**塞回对话历史。

**为什么是 `role: "user"` 而不是 `role: "assistant"`？**

这是 Anthropic Messages API 的格式要求：
```
→ user: 我要看目录
→ assistant: 好的（+ tool_use: bash）
→ user: tool_result（← 工具结果用 user role 塞回）
→ assistant: 目录里有这些文件...
```

`tool_result` 必须是 `role: "user"` 的 ContentBlock。它其实就是"假装是用户把工具的输出贴了回来"。

**塞回结果后，while 循环继续，再次调用 LLM。** LLM 看到工具结果后，决定是继续调用工具还是直接回答。

### 3.3.8 10 轮上限——为什么要有个"保险丝"？

```typescript
    this.state = "idle";
    return "[Error] Max tool turns exceeded";  // ㉑
```

**㉑ 如果 while 循环因为 `turn >= maxTurns` 而退出（不是 `return` 退出），走到这里。**

**为什么需要 10 轮上限？**

想象这个场景：

```
LLM: 我要执行 bash → 结果：文件不存在
LLM: 那我换个目录 → 结果：也找不到
LLM: 那我试试别的 → 结果：权限不足
LLM: 那我试试 sudo → 结果：没权限
LLM: 那我去根目录 → 结果：太多文件
...无限循环下去...
```

没有 10 轮上限，LLM 可能无限调用工具，永远不回答用户。你的 API 账单也会无限增长。

> **10 轮 = 一个"保险丝"。** 正常情况下 1-2 轮就够了。超过 10 轮说明 LLM 陷入某种"死循环"了。

## 3.4 辅助方法：getStatus、getHistory、clear

```typescript
getStatus(): AgentStatus {
  return {
    state: this.state,                // "idle" | "thinking"
    messageCount: this.messages.length, // 当前历史消息数
  };
}

getHistory(): readonly Message[] {
  return this.messages;               // 返回整个对话历史（只读）
}

clear(): void {
  this.messages = [];                 // 清空对话历史
}
```

**`getStatus()`** 给 Chat 层看——"Agent 现在忙不忙？对话有几条了？"

**`getHistory()`** 返回 `readonly Message[]`——调用方可以看历史，但不能修改历史。

**`clear()`** 把数组置空——"忘掉一切"。

### `readonly` 的作用

```typescript
getHistory(): readonly Message[] {
  return this.messages;
}

// 外部使用时：
const history = agent.getHistory();
history.push({ role: "user", content: "hi" });  // ❌ 编译错误！
// readonly 数组没有 push 方法
```

**`readonly` 是 TypeScript 的"只读保护"**。它只在编译时生效——运行时还是同一个数组。但它防止了你"不小心"在外部修改了 Agent 的内部状态。

---

# 第四章：全链路跟练——一次 chat() 调用的完整旅行

## 场景：用户输入 "list files"

### 第 0 步：Chat 调用

```
Chat: const response = await this.agent.chat("list files");
      ↓
进入 Agent.chat("list files")
```

### 第 1 步：记录输入 + 初始化

```
state = "thinking"
messages.push({ role: "user", content: "list files" })

messages = [
  { role: "user", content: "list files" }
]

turn = 0, maxTurns = 10
```

### 第 2 步：第一次 while 循环 (turn=1)

```
toolDefs = buildToolDefinitions()
→ [{ name: "bash", description: "...", input_schema: {...} }]

result = await client.complete(
  "You are a helpful coding assistant...",  // systemPrompt
  messages,                                   // 当前历史
  [bash 定义]                                 // 工具定义
)
    ↓
LLM 第一次回复：
  content: "我来帮你查看当前目录"
  toolUses: [{ id: "tu_1", name: "bash", input: { command: "ls" } }]
  kind: "success"

result.kind !== "error" → 继续

assistantBlocks = [
  { type: "text", text: "我来帮你查看当前目录" },
  { type: "tool_use", id: "tu_1", name: "bash", input: { command: "ls" } }
]
messages.push(assistant)

messages = [
  { role: "user", content: "list files" },
  { role: "assistant", content: [text + tool_use] }
]

toolUses.length > 0 → 不退出循环！
```

### 第 3 步：执行工具

```
遍历 toolUses:
  findTool("bash") → 找到 bashTool
  console.log("[Tool] bash {\"command\":\"ls\"}")

  output = await bashTool.execute({ command: "ls" })
    ↓
  bash 内部：exec("ls") → "src/\ndist/\n..."

  toolResultBlocks = [
    { type: "tool_result", tool_use_id: "tu_1", content: "src/\ndist/\n..." }
  ]

messages.push({ role: "user", content: toolResultBlocks })

messages = [
  { role: "user", content: "list files" },
  { role: "assistant", content: [text + tool_use] },
  { role: "user", content: [tool_result: "src/\ndist/\n..."] }
]

→ 继续 while 循环 (turn=2)
```

### 第 4 步：第二次 while 循环 (turn=2)

```
result = await client.complete(
  messages  ← 现在包含 ls 的结果了
)
    ↓
LLM 第二次回复：
  content: "当前目录有 src/ 和 dist/ 文件夹。"
  toolUses: []  ← 没有工具调用了！
  kind: "success"

toolUses.length === 0 → 退出循环！

state = "idle"
return "当前目录有 src/ 和 dist/ 文件夹。"
```

### 第 5 步：返回给 Chat

```
Chat: response = "当前目录有 src/ 和 dist/ 文件夹。"
Chat: console.log("Agent: 当前目录有 src/ 和 dist/ 文件夹。")
```

### 用流程图看整个过程

```
chat("list files")
  │
  ├─ state = "thinking"
  ├─ messages.push({ user: "list files" })
  │
  └─ while (turn=1):
       ├─ buildToolDefinitions()
       ├─ client.complete(messages)
       │    └─ LLM: "我来看看" + tool_use(bash)
       ├─ messages.push(assistant)
       ├─ toolUses.length > 0 → 继续
       │
       ├─ tool = findTool("bash")
       ├─ output = await bashTool.execute({command:"ls"})
       │    └─ 结果: "src/\ndist/\n..."
       ├─ messages.push(tool_result)
       │
       └─ while (turn=2):
            ├─ client.complete(messages)
            │    └─ LLM: "目录有 src/ 和 dist/"
            ├─ messages.push(assistant)
            ├─ toolUses.length === 0 → 退出循环
            │
            └─ return "当前目录有 src/ 和 dist/ 文件夹。"
                 │
                 └─ response = "当前目录有 src/ 和 dist/ 文件夹。"
```

---

# 第五章：types.ts 和 index.ts 是怎么配合的？

## 5.1 两者的角色

```
agent/types.ts                agent/index.ts
─────────────────             ─────────────────
"数据定义"                     "逻辑实现"

AgentConfig  → 构造函数用      constructor(client, config)
AgentState   → 状态管理用      this.state = "idle" | "thinking"
AgentStatus  → getStatus 用   getStatus() → AgentStatus
```

**数据定义在 types.ts，使用在 index.ts。**

## 5.2 引用关系

```
agent/types.ts
  ← 引用 llm/types.ts（Message 类型）
  ← 引用 tools/types.ts（Tool 类型）

agent/index.ts
  ← 引用 llm/client.ts（LLMClient 类 — 运行时！）
  ← 引用 llm/types.ts（LLMResult etc — 类型！）
  ← 引用 agent/types.ts（AgentConfig etc — 类型！）
  ← 引用 tools/types.ts（Tool 类型）
  ← 引用 tools/index.ts（findTool, buildToolDefinitions — 运行时！）
```

**发现规律了吗？**

- `types.ts` 只引用**其他模块的 types.ts**（纯类型）
- `index.ts` 引用**其他模块的 index.ts/client.ts**（运行时代码）+ **自己的 types.ts**

**这就形成了一个"安全的分层"：**

```
                 纯类型层（types.ts）
                 /
  agent/types.ts ───── llm/types.ts
                ───── tools/types.ts

                 运行时代码层（index.ts / client.ts）
                 /
  agent/index.ts ───── llm/client.ts（运行时）
                ───── tools/index.ts（运行时）
                ───── agent/types.ts（类型）
                ───── llm/types.ts（类型）
```

> **纯类型文件永远不会产生循环依赖**。因为 `import type` 在编译后完全消失，运行时没有任何依赖关系。

## 5.3 如果 types.ts 不存在会怎样？

假如把类型定义直接写在 index.ts 里：

```typescript
// agent/index.ts（假设没有 types.ts）
export interface AgentConfig { ... }    // 类型定义
export type AgentState = "...";         // 类型定义
export class Agent { ... }              // 逻辑实现
```

这时在其他文件中：

```typescript
// 如果 chat/index.ts 想用 AgentStatus 类型：
import type { AgentStatus } from "../agent/index.js";
// ↑ 即使只是 import type，它也会触发 agent/index.ts 的模块加载
// ↑ 而 agent/index.ts 又可能加载其他模块...
// ↑ 万一形成循环引用，TypeScript 也没法帮你（因为 import type 还在）
```

这个说法**基本正确，但有一个关键细节需要修正**。

## 核心问题：TypeScript 的 `import type` 到底会不会触发运行时加载？

实际上，**`import type` 在编译后会被完全擦除**，不会生成任何 JS 运行时代码。所以：

| 方面 | 实际情况 |
|------|---------|
| **运行时** | `import type` 不会触发任何模块加载，编译后不存在 |
| **编译时** | TypeScript 编译器确实需要读取/解析被导入的文件以获取类型信息 |
| **循环引用风险** | 纯类型层面的循环引用 TypeScript 通常可以处理；但如果涉及值的导入，才会出问题 |

## 图中说法的问题

图中的注释说：
> "即使只是 `import type`，它也会触发 `agent/index.ts` 的模块加载"

这里的**"模块加载"表述模糊**。准确地说：
- 不会触发**运行时**模块加载（JS 执行时不会加载）
- 但会触发**编译时**的文件解析（TS 编译器需要读取该文件）

## 真正的价值在于：关注点分离 + 避免值的循环依赖

分离 `types.ts` 的主要好处不是 `import type` vs `import` 的技术差异，而是：

```
┌─────────────────┐     ┌─────────────────┐
│   agent/types.ts │◄────│  chat/index.ts   │
│  (纯类型，无依赖) │     │  import type {...}│
└─────────────────┘     └─────────────────┘
         ▲
         │ import type
┌─────────────────┐
│  agent/index.ts │
│ (实现，可能有依赖)│
└─────────────────┘
```

**真正的优势：**
1. **编译速度**：`types.ts` 通常无依赖，编译器解析更快
2. **架构清晰**：类型契约与实现分离
3. **避免循环依赖**：当 `chat` 需要 `agent` 的类型，而 `agent` 又需要 `chat` 的值时，通过纯类型文件可以打破循环

## 总结

| 图中说法 | 修正 |
|---------|------|
| `import type` 会触发模块加载 | ❌ 不会触发**运行时**加载；编译时确实需要解析 |
| 分离 `types.ts` 是为了 `import type` 的安全 | ⚠️ 部分正确，但主要原因是架构解耦 |
| 纯类型文件"安全、快速、不产生循环依赖" | ✅ 基本正确，尤其是避免**值的循环依赖** |

**结论**：这个教学意图是对的（分离类型文件是好实践），但对 `import type` 机制的解释**不够精确**，容易让人误以为 `import type` 和 `import` 在运行时有区别——实际上它们在运行时**都没有区别**（都会被擦除），区别只在编译时的类型检查阶段。

但有了 `types.ts`：

```typescript
// chat/index.ts
import type { AgentStatus } from "../agent/types.js";
// ↑ 只加载纯类型文件，安全、快速、不产生循环依赖
```

---

## 附录：summary

```
agent/types.ts（16 行）
┌────────────────────────────────────────────┐
│  AgentConfig   创建 Agent 时的"入职表"      │
│  AgentState    "idle" | "thinking"         │
│  AgentStatus   给 Chat 看的"仪表盘"         │
└────────────────────────────────────────────┘

agent/index.ts（152 行）
┌────────────────────────────────────────────┐
│  class Agent                               │
│                                            │
│  字段：                                      │
│    client         LLM 客户端（依赖注入）      │
│    systemPrompt   行为准则                   │
│    messages[]     对话历史（核心数据）        │
│    state          "idle" / "thinking"       │
│    tools[]        工具列表                   │
│                                            │
│  chat(input)：    核心方法                   │
│   ① messages.push(user)                    │
│   ② while (turn < 10)                      │
│     ③ buildToolDefinitions()               │
│     ④ await client.complete(...)           │
│     ⑤ if (error) → return                  │
│     ⑥ messages.push(assistant)             │
│     ⑦ if (无 tool_use) → return 文本       │
│     ⑧ for (每个 tool_use)                  │
│       ⑨ findTool(name)                     │
│       ⑩ await tool.execute(input)          │
│     ⑪ messages.push(tool_result)           │
│     ⑫ → 回到 ②                            │
│   ⑬ return "Max tool turns"                │
│                                            │
│  getStatus()    → { state, messageCount }  │
│  clear()        → messages = []             │
└────────────────────────────────────────────┘
```

**"名片"（types.ts）定义了 Agent 是什么；"大脑"（index.ts）定义了 Agent 能做什么。两者的核心是那个 while 循环——Agent Loop。模型决定要不要用工具，代码负责执行和反馈。这个循环永远不会变。** 💡
