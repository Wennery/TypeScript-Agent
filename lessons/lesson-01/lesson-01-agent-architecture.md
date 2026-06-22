# 🧠 Lesson 01：Agent 骨架 — 从零看懂一个 AI Agent 的代码

> **欢迎来到 TypeScript Agent 的第一课！**
>
> 如果你是第一次接触 Agent 工程，没关系——这节课会带你**像翻自己家的抽屉一样**，把每一行代码拆开来看清楚。
>
> 学完之后你会：
> - ✅ 理解一个 Agent 项目长什么样
> - ✅ 看懂 TypeScript 进阶类型（联合类型、判别联合、泛型）
> - ✅ 掌握 `async/await` 和异步流的正确姿势
> - ✅ 明白 Agent Loop 的核心逻辑——为什么它是 Agent 的"心脏"
>
> **预备知识**：你已了解 TypeScript 基础类型、函数、类。如果你还没完全掌握，也没关系——碰到不懂的地方问我，我会随时解答。
>
> ---

---

## 目录

- [第一部分：项目概览——先看全景](#第一部分项目概览先看全景)
- [第二部分：TypeScript 进阶——本项目的"暗语"解密](#第二部分typescript-进阶本项目的暗语解密)
- [第三部分：代码逐层解剖](#第三部分代码逐层解剖)
   - [3.1 config/ —— 配置层](#31-config--配置层)
   - [3.2 llm/types.ts + client.ts —— LLM 通信层](#32-llmtypests--clientts--llm-通信层)
   - [3.3 tools/ —— 工具层](#33-tools--工具层)
   - [3.4 agent/ —— 心脏：Agent Loop](#34-agent--心脏agent-loop)
   - [3.5 chat/ —— 交互层](#35-chat--交互层)
   - [3.6 index.ts —— 入口：一切串联](#36-indexts--入口一切串联)
- [第四部分：数据流全链路跟练](#第四部分数据流全链路跟练)
- [第五部分：你能带走什么](#第五部分你能带走什么)
- [课后彩蛋：自己动手试试](#课后彩蛋自己动手试试)

---

## 第一部分：项目概览——先看全景

先看项目的目录结构（`src/` 文件夹）：

```
src/
├── index.ts          ← 入口，把所有人叫到一起
├── config/
│   └── index.ts      ← 读取环境变量，拿着 API Key
├── llm/
│   ├── types.ts      ← LLM 相关数据类型定义
│   └── client.ts     ← 跟大模型聊天的客户端
├── agent/
│   ├── types.ts      ← Agent 配置 / 状态类型
│   └── index.ts      ← 🎯 核心！Agent 大脑 + 对话循环
├── tools/
│   ├── types.ts      ← 工具的接口定义
│   ├── bash.ts       ← 一个具体工具：执行 Shell 命令
│   └── index.ts      ← 工具注册中心
└── chat/
    └── index.ts      ← 命令行聊天界面
```

### 这个项目在做什么？

**一句话**：这是一个**命令行里的 AI Agent**——你输入文字，它调用大模型，必要时执行 Shell 命令，然后把结果返回给你。

> 就像你在终端里跟一个"会自己动手的 ChatGPT"聊天。

### 为什么这么分层？

这是一个典型的**分层架构**，每一层各司其职：

```
┌──────────────────────────────────────┐
│   chat/        ← 用户交互（输入输出）    │
├──────────────────────────────────────┤
│   agent/       ← Agent Loop（大脑）    │
├──────────────────────────────────────┤
│   llm/         ← 跟大模型通信           │
│   tools/       ← 工具（Agent 的手）     │
├──────────────────────────────────────┤
│   config/      ← 配置                  │
└──────────────────────────────────────┘
```

**关键原则**：每一层只做自己的事，不越界。
- `chat` 不管业务逻辑，只管问问题和打印回复
- `agent` 不管用户怎么输入，只负责跟 LLM 来回对话
- `llm` 不管工具怎么执行，只管发 HTTP 请求
- `tools` 不管 LLM 是谁，只管执行命令

> 💡 这就是**单一职责原则**——以后你想加 Web UI、换大模型提供商、加新工具，都只动对应的一层就行。

---

## 第二部分：TypeScript 进阶——本项目的"暗语"解密

在深入代码之前，我们先攻克本项目里出现的几个**进阶 TypeScript 语法**。如果你已经会了，可以直接跳到第三部分；如果还不太熟，这一节会配着代码例子帮你一次搞懂。

### 2.1 `type` vs `interface`——什么时候用哪个？

本项目两种都用到了：

**`interface`** —— 描述"对象长什么样"，可以被 `extends` 扩展：
```typescript
// src/agent/types.ts
export interface AgentConfig {
  systemPrompt: string;
  tools?: Tool[];
}
```

**`type`** —— 更灵活，可以做联合类型、交叉类型、从其他类型派生：
```typescript
// src/agent/types.ts
export type AgentState = "idle" | "thinking";

// src/llm/types.ts
export type LLMResult = LLMResponse | LLMError;  // 联合类型！
```

> **什么时候用哪个？**
> - 描述对象结构 → `interface`
> - 描述"要么是 A 要么是 B" → `type` + 联合类型
> - 描述基本类型的别名 → `type`
>
> 不过这两个区别很小，同一个项目混用很正常。统一用哪个都行，关键是要一致。

### 2.2 联合类型（Union Types）和判别联合（Discriminated Unions）—— 这是本项目的灵魂

**联合类型**表示"可以是几种类型中的一种"：

```typescript
// src/agent/types.ts
export type AgentState = "idle" | "thinking";
// AgentState 的值只能是 "idle" 或 "thinking"，没有第三种
```

**判别联合** —— 更高级的用法，项目里大量使用：

```typescript
// src/llm/types.ts
export type LLMResult = LLMResponse | LLMError;

// 如果成功
interface LLMResponse {
  kind: "success";      // ← 这个 `kind` 就是"判别器"（discriminant）
  content: string;
  toolUses: [...];
}

// 如果失败
interface LLMError {
  kind: "error";        // ← 同样的字段，不同的值
  message: string;
  isRetryable: boolean;
}
```

**神奇的地方来了**——TypeScript 会根据 `kind` 自动缩窄类型：

```typescript
// agent/index.ts 第 71 行
const result: LLMResult = await this.client.complete(...);

if (result.kind === "error") {
  // 🔥 在这里，TypeScript 知道 result 一定是 LLMError
  // 所以你可以安全地访问 result.message，但不能访问 result.content
  return `[Error] ${result.message}`;
}

// 🔥 走到这里，TypeScript 知道 result 一定是 LLMResponse
// 所以可以安全地访问 result.content 和 result.toolUses
```

> 🎯 **这就是判别联合的精髓**：用一个共同的字段（`kind`）让 TypeScript 自动帮你缩小类型范围，不用手动做类型断言！这是本项目最常用的模式之一。

**再来看 ContentBlock —— 三种 block 的联合：**

```typescript
// src/llm/types.ts
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
```

这里 `type` 就是判别器。你在代码里根据 `type` 做判断时，TypeScript 会自动缩窄到对应的结构：

```typescript
function handleBlock(block: ContentBlock) {
  if (block.type === "text") {
    // ✅ 可以安全访问 block.text
  } else if (block.type === "tool_use") {
    // ✅ 可以安全访问 block.id, block.name, block.input
  }
}
```

### 2.3 可选属性（`?`）和 `undefined`

```typescript
export interface AgentConfig {
  systemPrompt: string;
  tools?: Tool[];    // ← ? 表示这个属性"要么有，要么 undefined"
}
```

在构造函数中：
```typescript
constructor(client: LLMClient, config: AgentConfig) {
  this.tools = config.tools || [];  // ← 如果 config.tools 是 undefined，就给空数组
}
```

> ⚠️ `tools?` 和 `tools: Tool[] | undefined` 在类型层面是一样的，但前者在初始化时可以完全不写这个字段。

### 2.4 `import type` —— 只在类型世界存在

```typescript
// src/agent/index.ts
import type { LLMClient } from "../llm/client.js";
import type { LLMResult } from "../llm/types.js";
```

`import type` 意思是"我只导入类型，不导入运行时的代码"。编译后这些导入会被完全删除。好处：
- **更快的编译**（TypeScript 不需要追踪这些模块的运行时依赖）
- **避免循环引用**（纯类型导入不会产生运行时循环依赖）

> 🔥 `import type` 是开启 `isolatedModules` 时的推荐做法，也是现代 TypeScript 项目的重要风格。

### 2.5 `as const` 的妙用

```typescript
const TOOLS = [...] as const;
// as const 让 TypeScript 推断出最具体的字面量类型
// 而不是宽泛的 string[]
```

本项目没有直接用 `as const`，但 Anthropic SDK 里大量使用。了解即可。

### 2.6 `Record<string, unknown>` —— 安全的"任意对象"

```typescript
execute: (args: Record<string, unknown>) => Promise<string>;
```

`Record<string, unknown>` 表示"键是字符串，值是未知类型"。比 `any` 安全，因为**你必须在用之前做类型判断或转换**：

```typescript
async (args: Record<string, unknown>) => {
  const command = args.command as string;  // ← 从 unknown 转成 string
  // ...
}
```

> ⚠️ 这里的 `as string` 其实是"我确信它一定是 string"。严谨的做法是先判断 `typeof args.command === "string"`，但在工具执行场景中，类型来自 LLM 的 JSON 输出，所以信任它是合理的。

### 2.7 `Promise` 和异步类型

```typescript
// 返回 Promise<string> 的函数
async function main(): Promise<void> { ... }

// 返回 Promise 的箭头函数
execute: (args: Record<string, unknown>) => Promise<string>;
```

- `Promise<void>` — 异步函数，没有返回值
- `Promise<string>` — 异步函数，最终返回 string
- `Promise<LLMResult>` — 异步函数，最终返回 LLMResult

---

## 第三部分：代码逐层解剖

现在我们来逐层拆解代码。我会从最"底层"（配置）往上走，直到整个应用跑起来。

### 3.1 config/ —— 配置层

**文件**：`src/config/index.ts`

```typescript
import "dotenv/config";

export interface Config {
  anthropicApiKey: string;
  anthropicModel: string;
  anthropicMaxTokens: number;
  anthropicBaseUrl?: string;
}

export function loadConfig(): Config {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("ANTHROPIC_API_KEY required in .env");
  }
  // ...
}
```

**它在做什么**？
- 从 `.env` 文件加载环境变量（`dotenv` 帮你做的）
- 读取 API Key、Model 名称、Max Tokens 等
- **验证**：如果 API Key 没填，直接抛异常——"Fail Fast"原则，与其跑到半路再报错，不如一开始就告诉你

**TypeScript 知识点**：
- `??` 是空值合并运算符：`model = process.env.MODEL ?? "default"` — 当左边是 `null` 或 `undefined` 时，取右边
- `parseInt(..., 10)` — 第二个参数 10 表示十进制，这是 `parseInt` 的规范写法
- `isNaN()` — 判断是否为 NaN，注意它是**全局函数**，不是 `Number.isNaN`

> 💡 这是整个应用最"朴实"的模块，但它体现了**一个重要的工程原则**：不要让配置到处散落，集中管理，出了问题好排查。

---

### 3.2 llm/types.ts + client.ts —— LLM 通信层

#### 3.2.1 类型定义

**文件**：`src/llm/types.ts`

这个文件定义了跟大模型通信时需要的所有类型，是整个项目的"共同语言"。

**Message** —— 对话的基本单位：
```typescript
export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}
```

注意 `content` 的类型：可以是**纯字符串**（简单对话），也可以是 **ContentBlock 数组**（带工具调用的对话）。

**ContentBlock** —— 消息的内容块，三种类型：
```typescript
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
```

这三种 block 对应 Anthropic Messages API 中消息的三种形式：
1. **text** — LLM 回复的文本内容
2. **tool_use** — LLM 说"我要调用这个工具"（带工具名称和参数）
3. **tool_result** — Agent 执行完工具后，把结果塞回去

```
LLM 回复: "让我先看看目录..."
           + [tool_use: id="tu_123", name="bash", input={command: "ls"}]
                          ↓
Agent 执行 bash("ls") → 拿到输出
                          ↓
Agent 把结果塞回: [tool_result: tool_use_id="tu_123", content="src/\ndist/\n..."]
```

**LLMResult** —— 调用 LLM 的结果可能是成功或失败：
```typescript
export type LLMResult = LLMResponse | LLMError;
```

这就是我们之前讲的**判别联合**。`kind` 字段就是判别器。

#### 3.2.2 客户端实现

**文件**：`src/llm/client.ts`

```typescript
export class LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  async complete(
    systemPrompt: string,
    messages: Message[],
    tools?: ToolDefinition[]
  ): Promise<LLMResult> {
    // ...
    const stream = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: messages as Anthropic.Messages.MessageParam[],
      stream: true,   // ← 关键！使用流式（streaming）响应
      ...(tools && tools.length > 0 ? { tools } : {}),
    });
    // ...
  }
}
```

**为什么用 `stream: true`？**
- 流式（streaming）意味着 LLM 是一个字一个字地返回的，而不是等全部生成完了再一次性给你
- 用户体验更好：不用干等，能看到文字逐渐出现
- 但代码更复杂——你需要**从流事件中拼接出完整内容**

**流式解析的机制**（第 43-82 行）：

```typescript
for await (const event of stream) {
  switch (event.type) {
    case "content_block_start":
      // LLM 开始输出一个新的内容块
      // 如果是 text → 开始积累文字
      // 如果是 tool_use → 记录 tool_use 的 id 和 name，准备接收 JSON 参数
      break;
    case "content_block_delta":
      // LLM 持续输出内容片段
      // text_delta → 追加文字
      // input_json_delta → 追加 tool_use 的 JSON 参数
      break;
    case "content_block_stop":
      // 一个内容块输出完毕
      // 如果是 tool_use → 把积累的 JSON 字符串解析成对象
      break;
    case "message_delta":
      // 整个消息快要结束，获取 stop_reason
      break;
  }
}
```

> 🔥 **这是本项目中异步编程最密集的地方**。`for await...of` 是 ES2018 引入的**异步迭代**语法，用来逐个处理流中的事件。每次 `await` 都不会阻塞整个程序，只是"等下一个事件到了再继续"。

**关于 `as` 类型断言**：
```typescript
messages as Anthropic.Messages.MessageParam[]
tools as Anthropic.Messages.Tool[]
```

这里用 `as` 是因为我们的类型跟 Anthropic SDK 的类型在结构上是兼容的（同一种形状），但 TypeScript 无法自动证明这一点。这属于**合理的类型断言**。

---

### 3.3 tools/ —— 工具层

工具是 Agent 的"手"——没有工具，Agent 只能聊天；有了工具，Agent 可以改变世界。

#### Tool 接口

**文件**：`src/tools/types.ts`

```typescript
export interface Tool {
  name: string;           // 工具名称（LLM 通过这个名字来调用）
  description: string;    // 描述（LLM 通过描述来决定什么时候用这个工具）
  input_schema: {         // 参数定义（LLM 知道该传什么参数）
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<string>;  // 执行函数
}
```

这个接口的设计直接对应 Anthropic API 的 Tool 定义。`name`、`description`、`input_schema` 三项就是发给 LLM 的"工具说明书"，`execute` 是实际的执行逻辑。

#### bash 工具实现

**文件**：`src/tools/bash.ts`

```typescript
export const bashTool: Tool = {
  name: "bash",
  description: "Execute a shell command in a working directory...",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute" },
    },
    required: ["command"],
  },
  execute: async (args) => {
    const { exec } = await import("node:child_process");
    const command = args.command as string;
    return new Promise((resolve) => {
      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          resolve(`Error: ${error.message}\nstderr: ${stderr}`);
        } else {
          resolve(stdout || stderr || "(no output)");
        }
      });
    });
  },
};
```

> 🎯 **重点看 `execute` 的类型**：`async (args: Record<string, unknown>) => Promise<string>`。它接受参数对象（从 LLM 的 JSON 解析而来），返回一个 Promise<string>。

**`new Promise(resolve => ...)` —— 把回调转成 Promise**：

`exec` 是 Node.js 的传统回调风格 API。要把回调转为 Promise（这样才能用 `await`），我们用 `new Promise` 包装：

```typescript
return new Promise((resolve) => {
  exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
    // 这个回调会在命令执行完后调用
    if (error) resolve(`Error: ...`);
    else resolve(stdout);
  });
});
```

> 🔥 注意这里用的是 `resolve` 而不是 `reject`——即使命令执行失败了，我们也不抛异常（reject），而是把错误信息作为**正常结果字符串**返回。这样 LLM 看到错误信息后可以自己决定下一步怎么做（比如重试或换个命令）。

**`await import()` —— 动态导入**：

```typescript
const { exec } = await import("node:child_process");
```
这不是在文件顶部静态导入，而是在执行时才动态加载。好处是**懒加载**——如果这个工具从来不被调用，就不需要加载 `child_process` 模块。

#### 工具注册中心

**文件**：`src/tools/index.ts`

```typescript
export const ALL_TOOLS: Tool[] = [bashTool];

export function findTool(name: string): Tool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export function buildToolDefinitions() {
  return ALL_TOOLS.map(({ name, description, input_schema }) => ({
    name, description, input_schema,
  }));
}
```

这个文件是所有工具的"登记处"：
- `ALL_TOOLS` — 所有工具的列表，加新工具就往这里加
- `findTool` — 根据名字找工具实例（Agent Loop 中用到）
- `buildToolDefinitions` — 把所有工具转换成 LLM 能理解的格式（只取 `name` + `description` + `input_schema`，不要 `execute`）

---

### 3.4 agent/ —— 心脏：Agent Loop

**文件**：`src/agent/index.ts`

这是整个项目的核心，也是**Agent 之所以是 Agent**的原因。

#### 3.4.1 Agent 类

```typescript
export class Agent {
  private client: LLMClient;
  private systemPrompt: string;
  private messages: Message[];   // ← 对话历史！所有消息都存在这里
  private state: AgentState;     // "idle" | "thinking"
  private tools: Tool[];

  constructor(client: LLMClient, config: AgentConfig) {
    this.client = client;
    this.systemPrompt = config.systemPrompt;
    this.messages = [];          // ← 初始时对话历史是空的
    this.state = "idle";
    this.tools = config.tools || [];
  }
}
```

**核心数据结构：`messages` 数组**

`messages` 是整个 Agent 的生命线。它记录了一切：
```
messages = [
  { role: "user", content: "帮我看看当前目录" },
  { role: "assistant", content: [
      { type: "text", text: "让我用 bash 看看" },
      { type: "tool_use", id: "tu_1", name: "bash", input: { command: "ls" } }
    ]
  },
  { role: "user", content: [
      { type: "tool_result", tool_use_id: "tu_1", content: "src/\ndist/\n..." }
    ]
  },
  { role: "assistant", content: "当前目录有 src/、dist/ 等文件夹..." },
]
```

每一轮对话、每一次工具调用和结果，都追加到这个数组里。

#### 3.4.2 Agent Loop —— 核心循环

```typescript
async chat(userInput: string): Promise<string> {
  this.state = "thinking";

  // Step 1: 把用户输入加入对话历史
  this.messages.push({ role: "user", content: userInput });

  // Step 2: 进入 Agent Loop（最多 10 轮）
  let turn = 0;
  const maxTurns = 10;

  while (turn < maxTurns) {
    turn++;

    // 2a: 构建工具的"说明书"
    const toolDefs = buildToolDefinitions();

    // 2b: 调用 LLM
    const result = await this.client.complete(
      this.systemPrompt, this.messages,
      toolDefs.length > 0 ? toolDefs : undefined
    );

    // 2c: 如果 LLM 报错，直接返回错误信息
    if (result.kind === "error") {
      this.state = "idle";
      return `[Error] ${result.message}`;
    }

    // 2d: 把 LLM 的回复（文本 + 工具调用请求）加入历史
    this.messages.push({ role: "assistant", content: assistantBlocks });

    // 2e: 如果没有工具调用，说明 LLM 回答完了 → 返回文本
    if (result.toolUses.length === 0) {
      this.state = "idle";
      return result.content;
    }

    // 2f: 有工具调用！逐个执行
    for (const tu of result.toolUses) {
      const tool = findTool(tu.name);
      const output = await tool.execute(tu.input);
      // 把结果包装成 tool_result block
    }

    // 2g: 把工具结果塞回 messages，继续循环
    this.messages.push({ role: "user", content: toolResultBlocks });
  }

  // 超过 10 轮 → 强制结束
  return "[Error] Max tool turns exceeded";
}
```

**我画个图让你看得更清晰：**

```
用户说："帮我看看当前目录"
       │
       ▼
  ┌─────────────────────────────┐
  │  Agent Loop                 │
  │                             │
  │  1. 追加用户消息到历史       │
  │  2. 调用 LLM（带工具定义）    │
  │  3. LLM 回复 ──── 无 tool   │
  │       │                     │  → 直接返回文本 ✅
  │       │ 有 tool_use         │
  │       ▼                     │
  │  4. 执行工具（bash ls）      │
  │  5. 把结果塞回历史           │
  │  6. 回到第 2 步（再次调 LLM）│
  │       │                     │
  │       ▼                     │
  │  LLM 看到结果，说："目录有..." │
  │  这次没有 tool_use → 退出    │
  └─────────────────────────────┘
       │
       ▼
    返回给用户
```

> 🔥 **这就是 Agent 的核心模式：循环 → 推理 → 行动 → 观察 → 再循环。** 这个模式永远不会变。后面你学的所有内容（权限、Hooks、子 Agent、记忆系统……）都是在**这个循环周围加装饰**，而不是改循环本身。

#### 3.4.3 为什么最多 10 轮？

如果 LLM 陷入死循环（比如反复执行同一个命令，结果总是不对），可能会无限调用工具。10 轮上限是一个安全阀。

后面我们会在更高级的课程中加入**更智能的错误恢复机制**，但 10 轮对于学习来说足够了。

---

### 3.5 chat/ —— 交互层

**文件**：`src/chat/index.ts`

```typescript
export class Chat {
  private agent: Agent;

  async start(): Promise<void> {
    while (true) {
      const input = await this.ask("You: ");

      if (input === "exit") break;
      if (input === "clear") { this.agent.clear(); continue; }

      const response = await this.agent.chat(input);
      console.log(`Agent: ${response}`);
    }
  }

  private ask(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => resolve(answer));
    });
  }
}
```

**`readline` + Promise 包装**：

```typescript
private ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    if (this.closed) { resolve(""); return; }   // ← 防止管道输入结束后报错
    this.rl.question(question, (answer) => resolve(answer));
  });
}
```

`readline.question` 是回调风格的。我们用 `new Promise` 把它包装成 async/await 风格，这样 `start()` 里就可以用 `await this.ask()` 了。

**为什么加 `closed` 标志？**

当输入来自管道（比如 `echo "hello" | npx tsx src/index.ts`）时，readline 会在输入流结束后触发 `close` 事件。此时再调用 `rl.question()` 会抛异常。`closed` 标志阻止了这种情况。

---

### 3.6 index.ts —— 入口：一切串联

**文件**：`src/index.ts`

```typescript
async function main(): Promise<void> {
  const config = loadConfig();                   // 1. 加载配置
  const client = new LLMClient(config);          // 2. 创建 LLM 客户端
  const agent = new Agent(client, {              // 3. 创建 Agent
    systemPrompt: "You are a helpful coding assistant...",
    tools: ALL_TOOLS,
  });
  const chat = new Chat(agent);                  // 4. 创建聊天界面
  await chat.start();                            // 5. 启动！
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

**依赖注入**的简单形式：Agent 不自己创建 LLMClient，而是由 `main()` 创建好再传进去。这样测试时可以传一个 mock 的 LLMClient。

> 🎯 整个应用的启动流程就是：**Config → LLMClient → Agent → Chat → 启动**。一条清晰的生产线。

---

## 第四部分：数据流全链路跟练

现在我们来模拟一次完整的对话，追踪每条数据的流动路径。

**场景**：用户输入 `"list files"`

### Step 1: 用户输入

```
chat/ → this.ask("You: ") 等待输入
用户输入 "list files"
chat/ → this.agent.chat("list files")
```

### Step 2: Agent 开始工作

```
agent/ → messages.push({ role: "user", content: "list files" })
       → 进入 while 循环
       → buildToolDefinitions()
       → client.complete(systemPrompt, messages, [bash def])
```

### Step 3: LLM 通信

```
llm/client.ts → 发 HTTP 请求到 Anthropic API（streaming）
              → 逐事件解析 stream
              → LLM 回复："我来帮你执行 ls 命令"
              → LLM 回复：tool_use(bash, {command: "ls"})
              → 返回 { kind: "success", content: "...", toolUses: [{name:"bash", input:{command:"ls"}}] }
```

### Step 4: Agent 处理工具调用

```
agent/ → 发现 result.toolUses 不为空
       → 遍历 toolUses
       → findTool("bash") → 找到 bashTool
       → tool.execute({ command: "ls" })
       → tools/bash.ts → exec("ls") → 返回 "src/\ndist/\n..."
       → 包装成 tool_result block
       → messages.push({ role: "user", content: [tool_result] })
       → 继续 while 循环
```

### Step 5: LLM 看到结果

```
agent/ → 再次调用 client.complete()
       → 这次 messages 里包含了工具结果
       → LLM 看到 ls 的输出
       → LLM 回复："当前目录有 src/、dist/ 等文件夹..."
       → 没有 tool_use → 退出循环
       → return "当前目录有 src/、dist/ 等文件夹..."
```

### Step 6: 返回给用户

```
chat/ → console.log("Agent: 当前目录有 src/、dist/ 等文件夹...")
       → 回到 while 开头，等待下一次输入
```

**完整的数据流如下：**

```
[用户] "list files"
  → chat.ask()
  → agent.chat("list files")
    → messages.push(user)
    → client.complete(..., messages, tools)
      → Anthropic API (streaming)
      ← { content: "...", toolUses: [{ name:"bash", input:{command:"ls"} }] }
    → messages.push(assistant with tool_use)
    → bashTool.execute({ command: "ls" })
      → exec("ls")
      ← "src/\ndist/\n..."
    → messages.push(user with tool_result)
    → client.complete(..., messages)  ← 第二次调用
      → Anthropic API
      ← { content: "当前目录有...", toolUses: [] }
    ← "当前目录有..."
  → console.log("Agent: 当前目录有...")
[用户看到回复]
```

---

## 第五部分：你能带走什么

通过这节课，你应该收获了：

### 🧩 关于 Agent 的核心认知

1. **Agent = LLM + Harness** — 模型提供智能，代码（Harness）提供行动能力
2. **Agent Loop 是心脏** — "推理 → 行动 → 观察 → 再推理"的循环永远不会变
3. **分层架构** — 每一层只做一件事，可以独立替换

### 🏗️ 关于本项目架构

```
config/  →  配置管理（读 .env，验证参数）
llm/     →  与大模型通信（发请求，解析 stream）
tools/   →  工具定义（注册、查找、执行）
agent/   →  Agent Loop（核心大脑）
chat/    →  用户交互（输入输出）
index.ts →  入口（组装所有模块）
```

### 📚 关于 TypeScript 进阶语法

| 概念 | 你会在哪里见到 |
|------|--------------|
| 联合类型 `A \| B` | `LLMResult = LLMResponse \| LLMError` |
| 判别联合 | `kind: "success" \| "error"` 让 TypeScript 自动缩窄类型 |
| `import type` | 导入纯类型，编译时被删除 |
| `Record<string, unknown>` | 安全替代 `any` 的"任意对象" |
| `async/await` | 整个项目无处不在，处理异步操作 |
| `for await...of` | 遍历 stream 事件 |
| `Promise` 包装回调 | `new Promise(resolve => rl.question(..., resolve))` |
| 可选属性 `?` | `tools?: Tool[]` 表示可有可无 |
| `??` 空值合并 | `model ?? "default"` 提供默认值 |
| 动态 `import()` | `const { exec } = await import("child_process")` |

---

## 课后彩蛋：自己动手试试

运行项目看看它怎么工作的：

```bash
# 确保 .env 已经配置好 API Key
npx tsx src/index.ts

# 然后输入
list files

# 试试更复杂的
whoami
cat package.json
```

你会看到 `[Tool] bash {command: "..."}` 的日志，说明 Agent 正在调用工具。

**尝试理解**：每次你输入一句话，Agent 是怎么决定"要不要用工具"的？是 LLM 自己判断的，还是代码里写死的？

> 答案是 **LLM 自己判断的**。代码只负责"如果 LLM 请求工具我就执行"，而"要不要用"、"用什么"——这些**决策权在模型手里**。这就是 Agent 和普通脚本的本质区别：脚本是写死的流程，Agent 是模型驱动的动态决策。

---

## 下一课预告

**Lesson 02** 中，我们会：
- 加一批新工具（读文件、写文件、搜索文件）
- 重构工具注册机制，让加新工具像填表一样简单
- 引入 Tool 设计的最佳实践——你的描述写得越好，LLM 调用得越准

但在那之前，请先消化这节课的内容。有什么不懂的，随时问我——每一步都踩实了再往前走 🚀

---

> *"The model decides. The harness executes."*
> 模型做决策，代码做执行。理解这句话，你就理解了 Agent 的一半。
