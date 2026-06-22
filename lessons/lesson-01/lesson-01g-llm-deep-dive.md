# ☎️ Lesson 01g：src/llm/——项目与 AI 世界的"电话线"

> 如果说 `agent/` 是项目的大脑，那 `llm/` 就是**大脑的听觉和语言中枢**。
>
> 它的职责只有一件事：**跟大模型（Anthropic）说话，然后把它的回复拆成我们代码能用的格式。**
>
> 两个文件：
> - **`types.ts`**（36 行）——"语言"的定义：message 长什么样、content block 有几种、LLM 的回复有几种
> - **`client.ts`**（108 行）——"电话机"：拿起听筒（构造客户端）、拨号（complete 方法）、听对方一句一句说话（streaming 解析）
>
> 这层是整个项目与外部世界通信的**唯一桥梁**。

---

## 目录

- [第一章：先看全景——llm/ 把大模型"包"成了什么？](#第一章先看全景llm-把大模型包成了什么)
- [第二章：types.ts——定义 LLM 世界的"通用语言"](#第二章typests定义-llm-世界的通用语言)
   - [2.1 ContentBlock——消息的最小"积木块"](#21-contentblock消息的最小积木块)
   - [2.2 Message——对话的"一句话"](#22-message对话的一句话)
   - [2.3 ToolDefinition——工具的"说明书"](#23-tooldefinition工具的说明书)
   - [2.4 LLMResponse + LLMError——两种回复结果](#24-llmresponse--llmerror两种回复结果)
   - [2.5 LLMResult = LLMResponse | LLMError——判别联合的妙用](#25-llmresult--llmresponse--llmerror判别联合的妙用)
- [第三章：client.ts——108 行的"电话总机"](#第三章clientts108-行的电话总机)
   - [3.1 类的结构——简洁的三个字段](#31-类的结构简洁的三个字段)
   - [3.2 构造函数——"买电话机"](#32-构造函数买电话机)
   - [3.3 complete() 方法——全链路拆解](#33-complete-方法全链路拆解)
   - [3.4 Streaming 解析——"逐字听写"的完整机制](#34-streaming-解析逐字听写的完整机制)
   - [3.5 错误处理——不是所有错误都一样](#35-错误处理不是所有错误都一样)
- [第四章：llm/ 层的设计哲学](#第四章llm-层的设计哲学)
- [第五章：全链路跟练——一次 complete() 调用的完整旅程](#第五章全链路跟练一次-complete-调用的完整旅程)

---

# 第一章：先看全景——llm/ 把大模型"包"成了什么？

如果没有 `llm/` 层，Agent 直接调用 Anthropic SDK 会怎样？

```typescript
// ❌ 没有 llm/ 层的噩梦
// agent/index.ts

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: "..." });

// Agent Loop 里直接处理 SDK 的原始格式
const raw = await anthropic.messages.create({
  model: "...",
  messages: rawMessages,
  stream: true,
  // ↑ streaming 返回一堆底层事件
  // ↑ Agent 要自己处理这些事件
  // ↑ Agent 要知道 Anthropic SDK 的细节
});
```

**问题在哪？**

1. **Agent 依赖了一个具体的 SDK**——如果明天换成 OpenAI，agent/index.ts 要全改
2. **Agent 要理解 streaming 事件**——streaming 的底层逻辑泄露到了上层
3. **Agent 耦合了 Anthropic 的数据格式**

`llm/` 层就是解决这个问题的——它把复杂、具体、第三方的 LLM 通信，**封装成一个简单的 `complete()` 方法**：

```typescript
// ✅ 有 llm/ 层之后
// agent/index.ts

const result = await this.client.complete(systemPrompt, messages, toolDefs);
// ↑ 简单清晰！不用管 SDK、不用管 streaming、不用管 Anthropic 格式
```

> **`llm/` 层 = 适配器模式（Adapter Pattern）**。它把外部 SDK 的复杂接口，转换成项目内部统一的简单接口。

### 它在整个项目中的位置

```
Agent (agent/index.ts)
  │
  │ this.client.complete(systemPrompt, messages, toolDefs)
  │
  ▼
LLMClient (llm/client.ts)
  │
  │ anthropic.messages.create(...)  ← 调用第三方 SDK
  │ for await (const event of stream)  ← 解析 streaming
  │
  ▼
Anthropic API (云服务)
```

**llm/ 层是 Agent 和外部 API 之间的"隔离带"。**

---

# 第二章：types.ts——定义 LLM 世界的"通用语言"

这个文件定义了**整个项目与大模型通信时所需的所有数据类型**。这些类型被 agent/、chat/、tools/ 甚至 src/index.ts 引用——它是项目的"通用语言"。

## 2.1 ContentBlock——消息的最小"积木块"

```typescript
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
```

**这是整个项目中最核心的数据类型之一。** 它描述了 LLM 消息中的"基本积木块"——一段消息可以是这些块的任意组合。

### 三种块分别代表什么？

| ContentBlock | 出现在哪 | 类比 |
|-------------|---------|------|
| `{ type: "text", text: "你好" }` | LLM 回复的普通文本 | 人说的话 |
| `{ type: "tool_use", id, name, input }` | LLM 说"我要调用工具" | 人说"我要用一下电脑" |
| `{ type: "tool_result", tool_use_id, content }` | Agent 把工具执行结果塞回去 | 电脑显示的结果被贴回来 |

### 为什么叫 ContentBlock？

Anthropic API 的响应体中，`content` 字段是一个**数组**，每个元素是一个"内容块"（Content Block）。LLM 的一次回复可能包含多个块：

```json
{
  "content": [
    { "type": "text", "text": "让我看看当前目录" },          // ← 块 1：text
    { "type": "tool_use", "id": "tu_1", "name": "bash",     // ← 块 2：tool_use
      "input": { "command": "ls" } }
  ]
}
```

### 为什么用 `type` + 联合类型而不是三个独立接口？

```typescript
// 用判别联合（本项目的方式）
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: ... }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

// 而不是三个独立接口：
export interface TextBlock { type: "text"; text: string; }
export interface ToolUseBlock { type: "tool_use"; id: string; name: string; input: ...; }
export interface ToolResultBlock { type: "tool_result"; tool_use_id: string; content: string; }
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;
```

最终效果一样。但用第一种写法（内联类型）文件更短，因为这三个结构都很简单——不值得每个都单独定义一个接口。

**核心价值：只要 `block.type === "text"`，TypeScript 就自动知道它一定有个 `text` 字段。这个机制在整个项目到处都在用。**

## 2.2 Message——对话的"一句话"

```typescript
export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}
```

**Message 是对话历史中的"一句话"。**

| 字段 | 含义 | 取值 |
|------|------|------|
| `role` | 谁说的 | `"user"`（用户说的）或 `"assistant"`（AI 说的）|
| `content` | 说的内容 | 要么是**纯文本**（简单对话），要么是 **ContentBlock 数组**（带工具调用的对话）|

### 为什么 content 有 `string` 和 `ContentBlock[]` 两种可能？

这是跟 Anthropic API 对齐的：

```json
// 简单消息：content 是字符串
{ "role": "user", "content": "list files" }

// 复杂消息：content 是块数组
{ "role": "assistant", "content": [
    { "type": "text", "text": "我来看看" },
    { "type": "tool_use", "id": "tu_1", "name": "bash", "input": { "command": "ls" } }
  ]
}
```

**`string | ContentBlock[]` 这个联合类型，正好对应这两种情况。**

### 在 agent/index.ts 中是怎么用的？

```typescript
// 简单用户输入（第 53 行）
this.messages.push({ role: "user", content: userInput });   // ← content 是 string

// 复杂的 assistant 回复（第 89 行）
this.messages.push({ role: "assistant", content: assistantBlocks }); // ← content 是 ContentBlock[]

// 工具结果（第 131 行）
this.messages.push({ role: "user", content: toolResultBlocks });     // ← content 是 ContentBlock[]
```

**所以 `messages` 数组里，`content` 有时是字符串，有时是数组——这就是 `string | ContentBlock[]` 的实际意义。**

## 2.3 ToolDefinition——工具的"说明书"

```typescript
export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: object;
};
```

**这是 LLM 看到的工具的样子。** 对比 `tools/types.ts` 里的 `Tool` 接口：

```typescript
// tools/types.ts —— 实际的工具（包含执行逻辑）
export interface Tool {
  name: string;
  description: string;
  input_schema: { ... };
  execute: (args) => Promise<string>;   // ← LLM 不需要知道这个
}

// llm/types.ts —— LLM 看到的工具（只含描述）
export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: object;                  // ← 没有 execute！
};
```

**`ToolDefinition` 是 `Tool` 的"去执行版"——只保留 LLM 做决策需要的信息。**

### `type` vs `interface` 的选择

这里用了 `type` 而不是 `interface`：

```typescript
export type ToolDefinition = { ... };    // ← type
export interface LLMResponse { ... };    // ← interface
```

两者的区别在本项目中不明显。这里用 `type` 纯粹是因为它是个简单的"结构体"，不需要被 `extends` 扩展。

## 2.4 LLMResponse + LLMError——两种回复结果

### 成功时的回复：LLMResponse

```typescript
export interface LLMResponse {
  kind: "success";
  content: string;                                              // LLM 说的文本
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>; // 工具调用列表
  stopReason: string;                                           // 为什么 LLM 停下来了
  usage: {
    inputTokens: number;                                        // 这次请求花了多少 token
    outputTokens: number;
  };
}
```

| 字段 | 含义 | 示例值 |
|------|------|--------|
| `content` | LLM 回复的文本 | `"我来帮你查看目录"` |
| `toolUses` | LLM 想要调用的工具列表 | `[{ id: "tu_1", name: "bash", input: { command: "ls" } }]` |
| `stopReason` | LLM 为什么停 | `"end_turn"`（答完了）/ `"tool_use"`（要调工具） |
| `usage.inputTokens` | 你发了多少字给 LLM | `150` |
| `usage.outputTokens` | LLM 回了多少字 | `42` |

**注意：`content` 和 `toolUses` 可以同时存在**——LLM 可以说"我来看看目录"（content）的同时调用 bash（toolUses）。

### 失败时的回复：LLMError

```typescript
export interface LLMError {
  kind: "error";
  message: string;        // 错误描述
  isRetryable: boolean;   // 是否可以重试
}
```

| 字段 | 含义 | 示例值 |
|------|------|--------|
| `message` | 错误信息 | `"Rate limit exceeded"` / `"API key invalid"` |
| `isRetryable` | 重试有没有意义 | `true`（限流了，等会儿再试） / `false`（API Key 错了，重试也没用） |

### `isRetryable` 的设计用意

```typescript
// 两种不同的错误：
// 429 Too Many Requests → isRetryable = true → 等会儿重试可能成功
// 401 Unauthorized      → isRetryable = false → API Key 错了，重试一万次也没用
// 500 Internal Error    → isRetryable = true → 服务器抽风，等会儿可能好
```

这个字段目前没有在 Agent 里用到（Agent 收到 error 就直接返回了），但它是为**以后的自动重试功能**预留的。

## 2.5 `LLMResult = LLMResponse | LLMError`——判别联合的妙用

```typescript
export type LLMResult = LLMResponse | LLMError;
```

这就是前面反复提到的**判别联合**。`kind` 字段就是判别器：

```typescript
const result: LLMResult = await client.complete(...);

if (result.kind === "error") {
  // 🔒 TypeScript 自动把 result 缩窄为 LLMError
  // 可以安全访问: result.message, result.isRetryable
  // 不能访问: result.content（LLMError 没有 content）
} else {
  // 🔒 TypeScript 自动把 result 缩窄为 LLMResponse
  // 可以安全访问: result.content, result.toolUses, result.usage
}
```

**没有这个联合类型，你会怎么做？**

```typescript
// ❌ 没有判别联合的写法
const result = await client.complete(...);

// 靠 "约定" 来判断
if ((result as any).kind === "error") {
  console.log((result as LLMError).message);
}
// ↑ 到处都是 as，没有类型安全
```

**有了判别联合，TypeScript 编译器替你做了所有类型检查。** 这就是它的价值。

---

# 第三章：client.ts——108 行的"电话总机"

## 3.1 类的结构——简洁的三个字段

```typescript
export class LLMClient {
  private client: Anthropic;    // 真正的 SDK 客户端
  private model: string;        // 模型名称
  private maxTokens: number;    // 最大 token 数

  constructor(config: Config)   // 配电话
  async complete(...)            // 打电话（核心）
}
```

**三个私有字段对应三个配置：**

| 字段 | 对应 .env 配置 | 示例值 |
|------|---------------|--------|
| `client` | `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL` | 一个 SDK 客户端对象 |
| `model` | `ANTHROPIC_MODEL` | `"mimo-v2.5"` |
| `maxTokens` | `ANTHROPIC_MAX_TOKENS` | `100000` |

## 3.2 构造函数——"买电话机"

```typescript
constructor(config: Config) {
  this.client = new Anthropic({           // ①
    apiKey: config.anthropicApiKey,
    baseURL: config.anthropicBaseUrl,
  });
  this.model = config.anthropicModel;      // ②
  this.maxTokens = config.anthropicMaxTokens;
}
```

**① `new Anthropic({...})`**

创建一个 Anthropic SDK 的客户端实例。传入了 API Key 和自定义的 Base URL（因为这里用的是代理中转地址 `https://api.xiaomimimo.com/anthropic`，而不是官方的 `https://api.anthropic.com`）。

**这行代码创建了一个"拨号器"**——它知道打给谁（baseURL）、用什么身份（apiKey），但还没有真正拨号。

**② 记住模型参数**

```typescript
this.model = "mimo-v2.5";       // 模型名
this.maxTokens = 100000;        // 一次最多生成多少 token
```

这些参数在每次 `complete()` 时都会被用到。

## 3.3 `complete()` 方法——全链路拆解

```typescript
async complete(
  systemPrompt: string,      // 系统提示词
  messages: Message[],       // 对话历史
  tools?: ToolDefinition[]   // 工具定义（可选）
): Promise<LLMResult> {
```

### 三个参数

| 参数 | 类型 | 作用 | 谁传来的 |
|------|------|------|---------|
| `systemPrompt` | `string` | Agent 的行为准则 | `agent/index.ts` 构造函数中保存的 |
| `messages` | `Message[]` | 整个对话历史 | `agent/index.ts` 的 `this.messages` |
| `tools` | `ToolDefinition[]`（可选） | 工具定义，告诉 LLM 可以用什么工具 | `tools/index.ts` 的 `buildToolDefinitions()` |

### 方法的两个主要阶段

```
complete()
  │
  ├─ try 块：
  │     ├─ ① 发请求（streaming）
  │     ├─ ② 解析 stream 事件
  │     └─ ③ 组装返回结果
  │
  └─ catch 块：
        ├─ ④ 判断错误类型
        └─ ⑤ 组装错误结果
```

### ① 发请求

```typescript
const stream = await this.client.messages.create({
  model: this.model,
  max_tokens: this.maxTokens,
  system: systemPrompt,
  messages: messages as Anthropic.Messages.MessageParam[],
  stream: true,
  ...(tools && tools.length > 0
    ? { tools: tools as Anthropic.Messages.Tool[] }
    : {}),
});
```

**这行代码在做三件事：**

1. **准备请求参数**：模型名、最大 tokens、系统提示词、对话历史、工具定义
2. **设置 `stream: true`**：告诉 API "一个字一个字地返回，不要等全部生成完"
3. **类型断言 `as`**：把我们自己的 `Message[]` 转成 SDK 所需的 `MessageParam[]`

### `stream: true` 是关键

```typescript
stream: true,   // ← 流式响应
```

**如果 `stream: false`（非流式）：**

你发出请求后，等啊等……等 LLM 全部生成完（可能几十秒），然后一次性拿到完整结果。几十秒里，界面卡死，用户以为程序挂了。

**如果 `stream: true`（流式）：**

你发出请求后，LLM 每生成一小段就给你推送一个事件。你可以边收边处理，用户体验好得多，而且可以及时处理 tool_use（LLM 可能在文本中间就请求调用工具）。

**代价：** 你需要处理一系列 stream 事件，把它们拼回完整的响应——这就是下面要讲的 streaming 解析。

## 3.4 Streaming 解析——"逐字听写"的完整机制

### 整体结构

```typescript
for await (const event of stream) {
  switch (event.type) {
    case "content_block_start":  // LLM 开始说一段话
    case "content_block_delta":  // LLM 继续说
    case "content_block_stop":   // LLM 这段话说完
    case "message_delta":        // LLM 整个消息快完了
  }
}
```

### 想象你在帮别人记录口述

```
你坐在会议室里，听 LLM "说话"，逐字记录：

LLM："我来帮……"
      ↑ content_block_start(text): "我来帮"

LLM："我来帮你查看……"
      ↑ content_block_delta(text_delta): "你查看"

LLM："我来帮你查看目录。"
      ↑ content_block_delta(text_delta): "目录。"

LLM 说完了第一段话。
      ↑ content_block_stop

LLM："现在我要用 bash 工具，参数是 {command: "ls"}"
      ↑ content_block_start(tool_use): id="tu_1", name="bash"
      ↑ content_block_delta(input_json_delta): '{"com'
      ↑ content_block_delta(input_json_delta): 'mand":"ls"}'
      ↑ content_block_stop → 解析 JSON → { command: "ls" }

LLM 说完了所有话。
      ↑ message_delta: stop_reason = "tool_use"
```

### 四种事件类型详解

#### 事件 1：`content_block_start` —— LLM 开始输出一个内容块

```typescript
case "content_block_start":
  if (event.content_block.type === "text") {
    content += event.content_block.text;  // 开始积累文本
  } else if (event.content_block.type === "tool_use") {
    currentToolUse = {
      id: event.content_block.id,        // "tu_1"
      name: event.content_block.name,    // "bash"
      inputJson: "",                     // 初始为空，等后续 delta
    };
  }
  break;
```

| 如果是 text block | 如果是 tool_use block |
|-------------------|----------------------|
| 把第一段文本加到 `content` | 创建 `currentToolUse` 对象，记录 `id` 和 `name` |
| `content = "我来帮"` | `currentToolUse = { id: "tu_1", name: "bash", inputJson: "" }` |

#### 事件 2：`content_block_delta` —— LLM 继续输出（核心逻辑在这里）

```typescript
case "content_block_delta":
  if (event.delta.type === "text_delta") {
    content += event.delta.text;            // 追加文本片段
  } else if (event.delta.type === "input_json_delta" && currentToolUse) {
    currentToolUse.inputJson += event.delta.partial_json;  // 追加 JSON 片段
  }
  break;
```

这是**最关键的逻辑**。`text_delta` 追加文本片段，`input_json_delta` 追加工具参数的 JSON 字符串片段：

```
四次 text_delta 事件：
  "我来" → "帮你" → "查看" → "目录"。
  content 最终 = "我来帮你查看目录。"

三次 input_json_delta 事件：
  '{"com' → 'mand":"ls"}' → ''(继续)
  inputJson 最终 = '{"command":"ls"}'
```

**`partial_json` 是什么？**

LLM 生成 JSON 参数时是一个字符一个字符地生成的。SDK 把这些字符串片段切成了多个 delta 事件。我们需要把它们拼接起来，最后一起解析。

#### 事件 3：`content_block_stop` —— LLM 这个内容块说完了

```typescript
case "content_block_stop":
  if (currentToolUse) {
    try {
      const input = JSON.parse(currentToolUse.inputJson || "{}");  // ①
      toolUses.push({ id: currentToolUse.id, name: currentToolUse.name, input });
    } catch {
      toolUses.push({ id: currentToolUse.id, name: currentToolUse.name, input: {} });  // ②
    }
    currentToolUse = null;  // ③
  }
  break;
```

**从无到有拼出一个完整的 `tool_use`：**

```
① JSON.parse('{"command":"ls"}')  →  { command: "ls" }
   把之前积累的 JSON 字符串解析成真正的对象

② 如果 JSON 解析失败（不完整的 JSON）→ 给空对象 {}
   LLM 一般不会生成坏 JSON，但如果出了问题，至少不崩
   这叫"防御性容错"——宁可给空参数，也不让程序崩溃

③ currentToolUse = null
   重置，准备接收下一个 tool_use
```

#### 事件 4：`message_delta` —— LLM 整个消息快结束了

```typescript
case "message_delta":
  stopReason = event.delta.stop_reason ?? "unknown";
  if (event.usage) {
    inputTokens = event.usage.input_tokens ?? 0;
    outputTokens = event.usage.output_tokens ?? 0;
  }
  break;
```

**`stop_reason` 是 Agent Loop 需要的最关键信息之一：**

| stop_reason | 含义 | Agent 的决策 |
|-------------|------|-------------|
| `"end_turn"` | LLM 回答完毕 | → 返回文本给用户 |
| `"tool_use"` | LLM 要求调用工具 | → 执行工具，继续循环 |
| `"max_tokens"` | 超出 token 上限被截断 | → 可能不完整，特殊处理 |
| `"stop_sequence"` | 遇到终止符 | → 正常结束 |

### 解析完成后的组装

```typescript
const result: LLMResponse = {
  kind: "success",
  content,         // 拼接好的完整文本，如 "我来帮你查看目录"
  toolUses,        // 所有解析好的工具调用，如 [{ id: "tu_1", name: "bash", input: { command: "ls" } }]
  stopReason,      // "tool_use" 或 "end_turn"
  usage: { inputTokens, outputTokens },  // token 统计
};
return result;
```

### Streaming 解析的完整流程图

```
LLM 开始说话...
    │
    ├── content_block_start (text)
    │   └─ "我来帮"
    │
    ├── content_block_delta (text_delta)
    │   └─ "你查看"
    │
    ├── content_block_delta (text_delta)
    │   └─ "目录。"
    │
    ├── content_block_stop
    │   └─ 第一段文本完成：content = "我来帮你查看目录。"
    │
    ├── content_block_start (tool_use)
    │   └─ currentToolUse = { id: "tu_1", name: "bash", inputJson: "" }
    │
    ├── content_block_delta (input_json_delta)
    │   └─ currentToolUse.inputJson += '{"com'
    │
    ├── content_block_delta (input_json_delta)
    │   └─ currentToolUse.inputJson += 'mand":"ls"}'
    │
    ├── content_block_stop
    │   └─ JSON.parse('{"command":"ls"}')
    │   └─ toolUses.push({ id: "tu_1", name: "bash", input: { command: "ls" } })
    │
    ├── message_delta
    │   └─ stopReason = "tool_use"
    │   └─ inputTokens = 150, outputTokens = 42
    │
    └── for 循环结束
        └─ return { kind: "success", content, toolUses, stopReason, usage }
```

## 3.5 错误处理——不是所有错误都一样

```typescript
catch (error) {
  let message = "Unknown error";
  let isRetryable = false;

  if (error instanceof Anthropic.APIError) {
    message = error.message;
    isRetryable = error.status === 429 || error.status >= 500;
    //                    ↑ 限流了             ↑ 服务器错误
    //                     可以重试              可能可以重试
  } else if (error instanceof Error) {
    message = error.message;
    // isRetryable 保持 false
  }

  const err: LLMError = { kind: "error", message, isRetryable };
  return err;  // ← 注意是 return 不是 throw！
}
```

### 关键设计：`return` 错误而不是 `throw` 错误

```typescript
// ✅ LLMClient 的做法：返回 LLMError
return { kind: "error", message: "...", isRetryable: false };

// ❌ 常见的做法：抛出异常
throw new Error("API request failed");
```

**为什么用 return 而不是 throw？**

因为 `complete()` 的返回类型已经是 `LLMResult = LLMResponse | LLMError`，它天然支持"成功或失败"两种结果。调用方（Agent）用 `result.kind === "error"` 就能判断，不需要 `try/catch`：

```typescript
// agent/index.ts 第 64 行
const result = await this.client.complete(...);

// 不需要 try/catch！
if (result.kind === "error") {
  return `[Error] ${result.message}`;  // ← 直接返回错误信息
}
// 正常处理 result.content
```

**好处：错误处理和正常流程用同一套机制（类型判断），而不是两套机制（try/catch + 正常返回）。**

### `error instanceof Anthropic.APIError` 的原理

```typescript
if (error instanceof Anthropic.APIError) {
  // 这是 Anthropic SDK 定义的 API 错误
  // 它有 error.status 属性（HTTP 状态码）
  isRetryable = error.status === 429 || error.status >= 500;
} else if (error instanceof Error) {
  // 这是一般性错误（如网络不通）
}
```

`instanceof` 是 JavaScript 的运算符，检查一个对象是否是某个类的实例。`Anthropic.APIError` 是 SDK 提供的错误类，包含了 `status`、`message` 等字段。

**三种可能的错误：**

| 错误类型 | 原因 | HTTP 状态码 | `isRetryable` |
|---------|------|------------|--------------|
| 限流 | 请求太频繁 | 429 | `true` |
| 服务器错误 | Anthropic 服务器抽风 | 500+ | `true` |
| API Key 无效 | 密钥错了 | 401 | `false` |
| 网络断开 | 你断网了 | 没有状态码 | `false` |

---

# 第四章：llm/ 层的设计哲学

## 4.1 为什么需要把 LLM 调用封装成一个类？

**替换成本的角度。**

假设项目没有 `llm/` 层，Agent 直接调 Anthropic SDK：

```typescript
// 没有 llm/ 层的 agent/index.ts
import Anthropic from "@anthropic-ai/sdk";

class Agent {
  async chat(input: string) {
    const anthropic = new Anthropic({ apiKey });
    const stream = await anthropic.messages.create({ ... });
    // 处理 stream 事件...
    // 解析 tool_use...
    // 计算 tokens...
  }
}
```

现在老板说："我们要换成 OpenAI！"

```typescript
// 噩梦开始...
// 你要修改 agent/index.ts 里所有跟 Anthropic SDK 相关的代码
// stream 事件格式不同
// tool_use 字段名不同
// 错误处理方式不同
// ……每个 LLM 提供商都有自己的一套
```

**有了 `llm/` 层，换提供商只需要改这一个文件：**

```typescript
// 把 llm/client.ts 的实现从 Anthropic 换成 OpenAI
// 只要保持 complete() 的入参和返回类型不变
// agent/index.ts 一行都不用改！
```

> **这就是"开闭原则"：对扩展开放（可以加新的 LLMClient），对修改封闭（Agent 不需要改）。**

## 4.2 类型断言 `as` 的合理性

```typescript
messages as Anthropic.Messages.MessageParam[]
tools as Anthropic.Messages.Tool[]
```

在 3.4 节的"发请求"部分，有两个 `as`。它们是**合理的类型断言**，因为我们的类型和 SDK 的类型在结构上是兼容的：

```
我们的 Message:        Anthropic SDK 的 MessageParam:
{ role: "user"|"assistant",     { role: "user"|"assistant",
  content: string|ContentBlock[]   content: string|ContentBlockParam[] }
}

我们的 ContentBlock:    SDK 的 ContentBlockParam:
{ type: "text", text }      TextBlockParam（完全兼容）
{ type: "tool_use", ... }   ToolUseBlockParam（完全兼容）
{ type: "tool_result", ... } ToolResultBlockParam（完全兼容）
```

因为结构兼容，运行时 `as` 不会出问题。但 TypeScript 无法自动证明这种兼容性（因为类型来自不同的包），所以需要手动告诉它："相信我，它们一样。"

## 4.3 `...` 展开运算符的妙用

```typescript
...(tools && tools.length > 0
  ? { tools: tools as Anthropic.Messages.Tool[] }
  : {})
```

这行代码的意思是：

```typescript
// 如果有工具定义：把 tools 字段展开到请求参数里
const params = {
  model: this.model,
  max_tokens: this.maxTokens,
  system: systemPrompt,
  messages: messages,
  stream: true,
  tools: [...],   // ← 展开进去
};

// 如果没有工具定义：不传 tools 字段
const params = {
  model: this.model,
  max_tokens: this.maxTokens,
  system: systemPrompt,
  messages: messages,
  stream: true,
  // 没有 tools 字段
};
```

**把条件判断 "内联" 到对象创建中**，比用 if/else 更简洁：

```typescript
// 等价于：
const requestParams: any = {
  model: this.model,
  max_tokens: this.maxTokens,
  system: systemPrompt,
  messages: messages,
  stream: true,
};
if (tools && tools.length > 0) {
  requestParams.tools = tools;
}
```

---

# 第五章：全链路跟练——一次 complete() 调用的完整旅程

## 场景：Agent 调用 `client.complete("You are a helpful...", messages, [bash定义])`

### 第 0 步：Agent 准备好参数

```
传入参数：
  systemPrompt = "You are a helpful coding assistant..."
  messages = [
    { role: "user", content: "list files" }
  ]
  tools = [{ name: "bash", description: "Execute a shell...", input_schema: {...} }]
```

### 第 1 步：创建 HTTPS 请求

```typescript
const stream = await this.client.messages.create({
  model: "mimo-v2.5",
  max_tokens: 100000,
  system: "You are a helpful coding assistant...",
  messages: [...],  // ← 转成 SDK 格式
  stream: true,
  tools: [{ name: "bash", description: "...", input_schema: {...} }],
});
```

这时程序 `await`，线程释放，等待网络响应。

几十毫秒后……

Anthropic API 开始返回 streaming 事件。

### 第 2 步：解析 streaming 事件

```
事件序列（按时间顺序）：
    ↓
  [content_block_start]  type=text    → content += "我来"
    ↓
  [content_block_delta]  text_delta   → content += "帮你"
    ↓
  [content_block_delta]  text_delta   → content += "查看"
    ↓
  [content_block_delta]  text_delta   → content += "当前目录"
    ↓
  [content_block_stop]                → 文本段完成
                                      → content = "我来帮你查看当前目录"
    ↓
  [content_block_start]  type=tool_use → id="tu_1", name="bash"
                                       → currentToolUse = { id, name, inputJson: "" }
    ↓
  [content_block_delta]  input_json    → inputJson += '{"com'
    ↓
  [content_block_delta]  input_json    → inputJson += 'mand":"ls"}'
    ↓
  [content_block_stop]                 → JSON.parse('{"command":"ls"}')
                                       → toolUses.push({ id: "tu_1", name: "bash", input: {command:"ls"} })
                                       → currentToolUse = null
    ↓
  [message_delta]                      → stopReason = "tool_use"
                                       → inputTokens = 85, outputTokens = 23
    ↓
  for 循环结束
```

### 第 3 步：组装返回结果

```typescript
return {
  kind: "success",
  content: "我来帮你查看当前目录",
  toolUses: [{ id: "tu_1", name: "bash", input: { command: "ls" } }],
  stopReason: "tool_use",
  usage: { inputTokens: 85, outputTokens: 23 },
};
```

### 第 4 步：回到 Agent Loop

```typescript
const result: LLMResult = await this.client.complete(...);

// result.kind === "success"

// 发现 toolUses.length > 0 → 执行工具
for (const tu of result.toolUses) {
  const tool = findTool(tu.name);   // → bashTool
  await tool.execute(tu.input);     // → execute({ command: "ls" })
}
```

---

## 附录：llm/ 知识速查

### 两个文件的分工

| 文件 | 行数 | 职责 | 类比 |
|------|------|------|------|
| `types.ts` | 36 | 定义 LLM 通信的所有数据类型 | 通话协议说明书 |
| `client.ts` | 108 | 实现与 LLM 的通信逻辑 | 电话机本身 |

### 核心数据流

```
类型定义（types.ts）：
  ContentBlock      = text | tool_use | tool_result
  Message           = { role, content: string | ContentBlock[] }
  ToolDefinition    = { name, description, input_schema }
  LLMResponse       = 成功结果 { content, toolUses, stopReason, usage }
  LLMError          = 失败结果 { message, isRetryable }
  LLMResult         = LLMResponse | LLMError

运行时流程（client.ts）：
  complete(system, messages, tools?)
    │
    ├─ Anthropic SDK → streaming 请求
    │
    ├─ for await (event of stream)
    │   ├─ content_block_start   → 开始累积文本或 tool_use
    │   ├─ content_block_delta   → 追加文本片段或 JSON 片段
    │   ├─ content_block_stop    → 完成一个块，解析 tool_use JSON
    │   └─ message_delta         → 记录 stop_reason 和 token 用量
    │
    ├─ 成功 → return LLMResponse
    │
    └─ 失败 → return LLMError（不是 throw！）
```

### 用一句话记住 llm/ 层

> **`llm/types.ts` 定义了"LLM 世界的通用语言"；`llm/client.ts` 把它翻译成 HTTP 请求，再把回复翻译回我们代码能用的格式。所有跟 Anthropic SDK 相关的脏活累活，都被隔离在这个文件夹里，外面的人（Agent、Chat）完全不需要知道。**
