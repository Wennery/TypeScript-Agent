# Lesson 02 — Tool Use

> **Motto:** *"Adding a tool means adding one handler — the loop stays untouched; new tools register into the dispatch map."*

## 概览

第一课我们构建了 Agent 骨架：一个 Agent Loop 接收 LLM 的 tool-call 请求，通过工具注册表查找工具，然后执行。但当时只有一个工具——`bash`，它像一个"万能口袋"：所有操作都用 shell 命令完成。

第二课的核心目标：**添加更多工具，验证"插拔式"架构的有效性。** 我们会新增 `read`、`write`、`glob` 三个工具，让 Agent 能够直接读写和搜索文件。整个过程中，Agent Loop 的代码一行都不需要改。

```
Lesson 01:  Agent Loop  ──→  [bash  (唯一工具)]
                                   ↓
Lesson 02:  Agent Loop  ──→  [bash, read, write, glob]   ← 多工具注册
                ↑                        ↑
        一行不改               只需加文件 + 一行注册
```

## 从 Lesson 01 到 Lesson 02：迭代升级详解

### 实体关系

```
Lesson 01 (只有一个工具):

  agent/loop.ts                      tools/index.ts
  ┌─────────────────────┐            ┌───────────────────┐
  │ llm → tool_call     │───────────→│ findTool("bash")  │
  │ result → back to llm│            │ ALL_TOOLS = [bash]│
  └─────────────────────┘            └───────────────────┘
                                              │
                                       tools/bash.ts
                                       ┌───────────┐
                                       │ exec()    │
                                       └───────────┘

Lesson 02 (四个工具):

  agent/loop.ts          tools/index.ts              tools/bash.ts
  ┌──────────────────┐   ┌────────────────────┐      ┌───────────┐
  │ llm → tool_call  │──→│ findTool("bash")   │─────→│ exec()    │
  │ result → back    │   │ findTool("read")   │──┐   └───────────┘
  └──────────────────┘   │ findTool("write")  │  │   ┌───────────┐
                         │ findTool("glob")   │  ├──→│ read.ts   │
                         │                    │  │   │ fs.read   │
                         │ ALL_TOOLS =        │  │   └───────────┘
                         │   [bash,read,write,│  │   ┌───────────┐
                         │    glob]            │  ├──→│ write.ts  │
                         └────────────────────┘  │   │ fs.write  │
                                                  │   └───────────┘
                                                  │   ┌───────────┐
                                                  └──→│ glob.ts   │
                                                      │ fs.glob   │
                                                      └───────────┘
```

**关键变化**：整个 Agent Loop（`agent/index.ts` 里的 `chat()` 方法）没有任何改动。它只调用 `findTool(name)`——至于这个 name 对应哪个工具，Loop 根本不需要知道。

### 流程对比

```
Lesson 01 (对话执行路径):

  User: "项目里有哪些 TypeScript 文件？"
    ↓
  LLM 生成: tool_call{name:"bash", args:{command:"find . -name '*.ts'"}}
    ↓
  bash 执行 find 命令 → 文件列表 → LLM 回复用户

Lesson 02 (同样的需求，更合理的路径):

  User: "项目里有哪些 TypeScript 文件？"
    ↓
  LLM 生成: tool_call{name:"glob", args:{pattern:"**/*.ts"}}
    ↓
  glob 直接搜索 → 文件列表 → LLM 回复用户
```

**差别在哪里？**

- Lesson 01 的 bash 依赖 shell 命令（`find`、`echo`、`cat`），跨平台兼容性差，输出格式不稳定
- Lesson 02 的 read/write/glob 是**结构化工具**，参数有 schema，LLM 更容易正确使用，行为可预测

## 新增代码说明

### `src/tools/read.ts`

```typescript
import type { Tool } from "./types.js";
import { readFile } from "node:fs/promises";

export const readTool: Tool = {
  name: "read",
  description: /* ... */,
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "..." },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const path = args.path as string;
    try {
      const content = await readFile(path, "utf-8");
      return content;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
```

**关键知识点：**

| 概念 | 说明 |
|------|------|
| `import { readFile } from "node:fs/promises"` | Node.js 内置的异步文件读取 API。现代 Node.js 推荐使用 `fs/promises` 而非回调式的 `fs.readFile(path, "utf-8", cb)` |
| `async / await` | `execute` 是 async 函数，内部用 `await readFile(...)` 等待文件读取完成。对 Java 开发者来说类似 `CompletableFuture`；对 Python 开发者来说和 `await` + `asyncio` 语义一致 |
| `args.path as string` | TypeScript 类型断言。`args` 类型是 `Record<string, unknown>`，因为工具参数在运行时来自 LLM 的 JSON。`as string` 告诉编译器"相信我，它就是一个 string" |
| `err instanceof Error` | 类型守卫。JavaScript 的 `catch` 可以捕获任何类型（不仅是 Error），所以需要先检查再取 `.message` |
| `Promise<string>` | 返回值类型。所有工具的 execute 都返回 Promise<string>，统一规约 |

### `src/tools/write.ts`

```typescript
import type { Tool } from "./types.js";
import { writeFile } from "node:fs/promises";

export const writeTool: Tool = {
  name: "write",
  description: /* ... */,
  input_schema: {
    type: "object",
    properties: {
      path:    { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const path = args.path as string;
    const content = args.content as string;
    try {
      await writeFile(path, content, "utf-8");
      return `Successfully wrote ${content.length} bytes to ${path}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
```

### `src/tools/glob.ts`

```typescript
import type { Tool } from "./types.js";
import { glob } from "node:fs/promises";

export const globTool: Tool = {
  name: "glob",
  description: "Search for files matching a glob pattern. ...",
  input_schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "..." },
    },
    required: ["pattern"],
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const pattern = args.pattern as string;
    try {
      const matches: string[] = [];
      for await (const entry of glob(pattern)) {
        matches.push(entry);
      }
      return matches.length > 0 ? matches.join("\n") : "(no matches)";
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
```

**关于 `for await...of`**：这是 JavaScript 的**异步迭代**语法。`glob(pattern)` 返回一个 `AsyncIterable`，逐个吐出匹配的文件路径，而不是一次加载全部到内存。对大规模文件搜索非常高效。

```typescript
// 传统方式（等全部结果）：
const all = await someAsyncFunction();
all.forEach(item => process(item));

// 异步迭代（逐个处理，边搜边处理）✓ glob 用的方式：
for await (const item of someAsyncIterable) {
  process(item);
}
```

对比 Python 的 `async for`：
```python
async for entry in glob_iter("**/*.ts"):
    process(entry)
```

### 异步风格对比

| 工具 | 异步模式 | 文件长度 |
|------|----------|----------|
| `bash.ts` | 回调式 `exec(cmd, cb)` wrapped in `new Promise` | 34 行 |
| `read.ts` / `write.ts` / `glob.ts` | 直接 `await readFile()` / `for await...of glob()` | 各 30 行 |

这不是巧合——Lesson 02 的设计目的之一就是**展示更自然的 async/await 写法**。Node.js 早期只有回调式 API（`fs.readFile(path, cb)`），后来有了 `util.promisify`，再后来直接提供了 `fs/promises`。用 Java 类比：

```
Java:    Future<String> content = executor.submit(() -> readFile(path));
Python:  content = await async_read_file(path)    # asyncio
TS/JS:   const content = await readFile(path)      # fs/promises
```

对 Java 开发者来说，`await readFile()` ≈ `future.get()` 但非阻塞（不占线程）。
对 Python 开发者来说，`await readFile()` 跟你用 `aiofiles` 一样——只是它是内置的。

### `src/tools/index.ts` 的变更

```typescript
// Before (Lesson 01)
import { bashTool } from "./bash.js";
export const ALL_TOOLS: Tool[] = [bashTool];

// After (Lesson 02)
import { bashTool } from "./bash.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { globTool } from "./glob.js";
export const ALL_TOOLS: Tool[] = [bashTool, readTool, writeTool, globTool];
```

**这就是"adding a tool means adding one handler"的 literal 含义：** 新增一个工具只需要：
1. 创建一个文件（如 `glob.ts`），导出 `Tool` 对象
2. 在 `index.ts` 里 import 并加入 `ALL_TOOLS`

Agent Loop、系统提示、执行引擎——全都不需要动。

## 架构原则：关注点分离

```
         Agent Loop (不变)
              │
    ┌─────────┼─────────┼──────┐
    │         │         │      │
  bash.ts  read.ts  write.ts  glob.ts
              │
      ┌───────┴───────┐
    fs/promises   child_process
```

Lesson 01 把所有能力塞进 `bash` 一个工具——这也是可以的，很多早期 Agent 就是这样做的。但这相当于"把所有方法放在一个类里"——耦合。Lesson 02 拆成多个工具，每一个只做一件事：

| 工具 | 职责 | 依赖 |
|------|------|------|
| `bash` | 执行 shell 命令 | `child_process.exec` |
| `read` | 读取文件内容 | `fs/promises.readFile` |
| `write` | 写入文件内容 | `fs/promises.writeFile` |
| `glob` | 搜索文件 | `fs/promises.glob` |

**Unix 哲学**：Do one thing and do it well。

## 关于系统提示（System Prompt）

在开发过程中有一个值得记录的设计迭代，它揭示了 Agent 架构中的一条重要原则。

### 过程回顾

**Step 1 — 硬编码（初版）**

```typescript
// 在 src/index.ts 里硬编码工具列表
systemPrompt:
  "You are a helpful coding assistant. " +
  "You have access to the following tools:\n" +
  "- bash: Execute shell commands ...\n" +
  "- read: Read file contents ...\n" +
  "- write: Write content to files ...\n" +
  "Use tools when needed. Answer concisely.",
```

问题：每加一个工具就要改 `src/index.ts`，违反 DRY。

**Step 2 — 动态生成（中间态）**

```typescript
// 在 tools/index.ts 里加一个生成函数
export function buildToolDescriptionText(): string {
  return ALL_TOOLS.map(t => `- ${t.name}: ${t.description}`).join("\n");
}

// src/index.ts 调用它
systemPrompt:
  "You are a helpful coding assistant.\n" +
  buildToolDescriptionText() + "\n\nUse tools when needed."
```

这样加工具时系统提示自动同步了，好一些。但发现另一个问题……

**Step 3 — 发现冗余**

`agent/index.ts` 里已经通过 `buildToolDefinitions()` 把工具的 name、description、input_schema 作为 API 的 `tools` 参数传给了 LLM：

```typescript
// agent/index.ts — 工具定义已通过 API 参数传递
const toolDefs = buildToolDefinitions();
const result: LLMResult = await this.client.complete(
  this.systemPrompt,
  this.messages,
  toolDefs.length > 0 ? toolDefs : undefined  // ← 这里
);
```

在 `llm/client.ts` 里：

```typescript
// Anthropic API 的 tools 参数已经包含了工具的完整信息
...(tools && tools.length > 0
  ? { tools: tools as Anthropic.Messages.Tool[] }
  : {})
```

**所以系统提示里再写一遍工具列表是多余的。** LLM 的 tool use / function calling 机制本身就是靠 `tools` 参数来知道有哪些工具的。系统提示应该只告诉 LLM **行为规则**，不重复**工具清单**。

**Step 4 — 最终态（简洁、无重复）**

```typescript
// src/index.ts
systemPrompt:
  "You are a helpful assistant. " +
  "You have tools available — use them when needed. Answer concisely.",
```

### 关键原则

```
系统提示（System Prompt）  →  行为指令     （behavior）
API 参数（tools）          →  工具定义     （capability）

两者各司其职，不交叉，不重复。
```

这条原则对你的 Agent 开发会反复出现：**信息应该放在它最自然的那个通道里。**

## TypeScript 工具箱

### 1. `fs/promises` vs `fs`（Node.js 异步进化史）

```typescript
// Stage 1 — 回调地狱（Callback Hell）
import { readFile } from "fs";
readFile(path, "utf-8", (err, data) => {
  if (err) handle(err);
  else process(data);
});

// Stage 2 — util.promisify 转型
import { readFile } from "fs";
import { promisify } from "util";
const readFileAsync = promisify(readFile);
const data = await readFileAsync(path);

// Stage 3 — fs/promises（现代，从 Node 14 起稳定）✓ 我们用的
import { readFile } from "fs/promises";
const data = await readFile(path);
```

**Lesson 01 的 bash.ts 用了 Stage 1+Stage 2 的混合**（`new Promise` 包裹 `exec`），而 **Lesson 02 的 read/write/glob 用了 Stage 3**。这是有意的——你可以在同一个项目里看到两种风格的对比。

### 2. 静态 import vs 动态 import

bash.ts 用了**动态 import**：
```typescript
const { exec } = await import("node:child_process");
```
read.ts / write.ts / glob.ts 用了**静态 import**：
```typescript
import { readFile } from "node:fs/promises";
```

**区别**：

| | 静态 import（顶层） | 动态 import（运行时） |
|---|---|---|
| 时机 | 模块加载时 | 执行到该行时 |
| 性能 | 加载时一次性 | 每次调用都执行 |
| 优势 | 编译器优化、tree-shaking | 懒加载、条件加载 |
| 适合 | 确定一定会用到的模块 | 可能不用的或很大的模块 |

对于 `fs/promises` 这种小且必定会用到的模块，静态 import 更合适。

### 3. `for await...of` — 异步迭代

```typescript
for await (const entry of glob("**/*.ts")) {
  matches.push(entry);
}
```

这是 ES2018 引入的语法，用于遍历**异步可迭代对象**（AsyncIterable）。关键区别：

| | 普通 `for...of` | `for await...of` |
|---|---|---|
| 作用对象 | `Iterable`（数组、Map、Set） | `AsyncIterable`（异步生成器、流） |
| 每次迭代 | 同步取下一个值 | await 下一个值 |
| 用途 | 普通遍历 | 流式数据、分页、文件搜索 |

### 4. 关于 `node:` 前缀

```typescript
import { readFile } from "node:fs/promises";   // 带 node: 前缀
const { exec } = await import("child_process");  // 无前缀
```

`node:` 是 Node.js 的**协议导入前缀**（从 Node 14.18 起引入），明确告知"这是 Node.js 内置模块，不是 npm 包"。加不加在功能上等价，但推荐加 `node:` 以获得：

- 更快的模块解析（跳过 npm 包搜索）
- 更明确的语义（一眼看出是 Node 内置模块）
- 更好的类型推断

## 挑战练习

学完本课后，尝试独立完成以下练习：

1. **基准级**：现在 `glob` 返回的是纯文本（每行一个路径）。改造它，让其支持可选的 `json` 参数——当 `json: true` 时返回 JSON 数组格式 `["file1.ts", "file2.ts"]`。
2. **进阶级**：改造 `bash.ts`，把动态 import 改为静态 import，理解两种模式的差异对运行时的影响。
3. **设计级**：如果 LLM 调用了一个不存在的 tool name，Agent Loop 会返回什么？阅读 `agent/index.ts` 中的 `chat()` 方法，定位错误处理逻辑。
4. **反思级**：查看 `agent/index.ts`，确认 `buildToolDefinitions()` 怎么传给 `client.complete()`，再查看 `llm/client.ts` 里 tools 参数如何注入 API 调用。理解为什么系统提示不需要重复工具列表。

## 小结

这一课的核心收获：

1. **工具注册模式**：`ALL_TOOLS` 数组是"工具注册表"，新增工具只需添加数组元素
2. **Agent Loop 不变**：整个执行引擎不需要为新增工具做任何修改——这是架构优势
3. **fs/promises**：现代 Node.js 的异步文件 API，与 async/await 完美配合
4. **关注点分离**：bash 只管 shell，read 只管读，write 只管写，glob 只管搜——各司其职
5. **系统提示原则**：行为指令放系统提示，工具定义放 API 参数——各司其职
6. **TypeScript 与 Node.js 的集成**：静态 import、`node:` 协议前缀、类型断言、异步迭代

---

*"Adding a tool means adding one handler — the loop stays untouched; new tools register into the dispatch map."*
