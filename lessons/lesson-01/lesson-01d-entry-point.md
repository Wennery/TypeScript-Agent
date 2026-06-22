# 🚪 Lesson 01d：src/index.ts——整个程序的"大门"

> 这个文件只有 **28 行**，但它是**整个程序的启动点**。
>
> 如果说项目是一台机器，`src/index.ts` 就是那个 **"按下开机键"** 的动作。
>
> 我们把这 28 行拆开，每一行都搞明白它做了什么、为什么这么写、跟其他文件怎么配合。

---

## 目录

- [第一章：先看全貌——28 行的"开机仪式"](#第一章先看全貌28行的开机仪式)
- [第二章：import 行——程序的"采购清单"](#第二章import-行程序的采购清单)
- [第三章：main() 函数体——五步组装生产线](#第三章main-函数体五步组装生产线)
- [第四章：main().catch()——程序的"安全气囊"](#第四章maincatch程序的安全气囊)
- [第五章：全链路跟练——从开机到关机](#第五章全链路跟练从开机到关机)
- [第六章：为什么这样设计？——入口文件的哲学](#第六章为什么这样设计入口文件的哲学)
- [附录：src/index.ts 与其他 index.ts 的区别](#附录srcindexts-与其他-indexts-的区别)

---

# 第一章：先看全貌——28 行的"开机仪式"

```typescript
// src/index.ts

import { loadConfig } from "./config/index.js";       // ① 采购：配置
import { LLMClient } from "./llm/client.js";           // ② 采购：LLM 客户端
import { Agent } from "./agent/index.js";              // ③ 采购：Agent
import { Chat } from "./chat/index.js";                // ④ 采购：聊天界面
import { ALL_TOOLS } from "./tools/index.js";          // ⑤ 采购：所有工具

async function main(): Promise<void> {                 // 🎬 开机仪式开始
  const config = loadConfig();                         // Step 1: 插电源（读取配置）
  const client = new LLMClient(config);                // Step 2: 装发动机（创建 LLM 客户端）

  const agent = new Agent(client, {                    // Step 3: 组装车身（创建 Agent）
    systemPrompt:                                      //         - 贴上"驾驶指南"
      "You are a helpful coding assistant. " +
      "You have access to a bash tool that can execute shell commands. " +
      "Use it when needed to help the user. Answer concisely.",
    tools: ALL_TOOLS,                                  //         - 装上车轮（工具）
  });

  const chat = new Chat(agent);                        // Step 4: 装驾驶舱（创建聊天界面）
  await chat.start();                                  // Step 5: 点火启动！
}

main().catch((err) => {                                // 🛡️ 安全气囊
  console.error("Fatal:", err);
  process.exit(1);
});
```

## 把 28 行翻译成"人话"

```
1-7 行：  采购买零件
          ↓
9 行：    宣布"我要开工了"
10 行：   插电源，检查电压（读配置）
11 行：   把发动机装好（建 LLM 客户端）
13-19 行：把发动机、驾驶指南、轮子都装到车架上（建 Agent）
21 行：   装方向盘和座椅（建 Chat）
22 行：   点火，启动！（Chat.start）
          ↓
25-28 行：如果炸了 → 安全气囊弹出（错误处理）
```

---

# 第二章：import 行——程序的"采购清单"

```typescript
import { loadConfig } from "./config/index.js";
import { LLMClient } from "./llm/client.js";
import { Agent } from "./agent/index.js";
import { Chat } from "./chat/index.js";
import { ALL_TOOLS } from "./tools/index.js";
```

## 2.1 每一行在"采购"什么？

| import 行 | 采购了什么 | 来自哪里 | 买来做什么 |
|-----------|-----------|---------|-----------|
| `loadConfig` | 一个**函数** | `config/index.js` | 读取 .env，返回配置对象 |
| `LLMClient` | 一个**类** | `llm/client.js` | 创建跟大模型通信的客户端 |
| `Agent` | 一个**类** | `agent/index.js` | 创建 Agent 实例 |
| `Chat` | 一个**类** | `chat/index.js` | 创建命令行聊天界面 |
| `ALL_TOOLS` | 一个**数组** | `tools/index.js` | 包含所有可用工具的列表 |

### 用餐厅类比

```
import { loadConfig } from "./config/index.js";
  →  采购清单上写："从厨房拿一把菜刀（loadConfig）"

import { LLMClient } from "./llm/client.js";
  →  采购清单上写："从储藏室拿一个炉灶（LLMClient）"

import { Agent } from "./agent/index.js";
  →  采购清单上写："从仓库拿一个厨师（Agent）"

import { Chat } from "./chat/index.js";
  →  采购清单上写："从大厅拿一个服务员（Chat）"

import { ALL_TOOLS } from "./tools/index.js";
  →  采购清单上写："从工具箱拿整套厨具（ALL_TOOLS）"
```

**这 5 行 import 过后，`src/index.ts` 就拥有了启动整个项目需要的所有"零件"。**

## 2.2 为什么有的 import 有花括号 `{}`，有的没有？

```typescript
import { loadConfig } from "./config/index.js";    // ✅ 花括号
import { LLMClient } from "./llm/client.js";        // ✅ 花括号
```

### 区分"命名导出"和"默认导出"

**本项目全部使用"命名导出"（named export）：**

```typescript
// config/index.ts
export function loadConfig() { ... }      // ← 命名导出
// 所以 import 时必须写 { loadConfig }，名字必须匹配

// tools/index.ts
export const ALL_TOOLS = [...]             // ← 命名导出
export function findTool() { ... }        // ← 命名导出
// 所以 import 时写 { ALL_TOOLS }
```

**如果用"默认导出"（default export）：**

```typescript
// 假设这样写
export default class LLMClient { ... }

// 那么 import 可以不用花括号，名字可以随便起
import MyClient from "./llm/client.js";    // ✅ 不用花括号，名字不同也行
import LLMClient from "./llm/client.js";   // ✅ 也行
```

> **本项目全部使用命名导出**，所以 import 时都需要花括号，且名字必须跟 export 的名字一致。这是现代 TypeScript 项目的常见风格。

## 2.3 为什么路径后面都有 `.js`？

```typescript
import { loadConfig } from "./config/index.js";   // ← 注意 .js 后缀！
```

**在 TypeScript 源码里写 `.js` 拓展名**，这看起来是不是很奇怪？

原因是：**TypeScript 编译后把 `.ts` 文件变成 `.js` 文件，但 import 路径不变。** 编译前：

```
src/config/index.ts   → 编译后 → dist/config/index.js
src/index.ts          → 编译后 → dist/index.js
```

`src/index.ts` 里写 `import ... from "./config/index.js"`，编译后 `dist/index.js` 里还是 `import ... from "./config/index.js"`——路径在运行时是**正确的**。

> 🎯 **记住：在 TypeScript 中，import 路径写编译后（.js）的路径，不是编译前（.ts）的路径。**

## 2.4 这些 import 在"背后"做了什么？

你以为 import 只是"声明一下我要用什么东西"。实际上 JavaScript 引擎做了这些事：

```
import { loadConfig } from "./config/index.js"
    ↓
1. 查找文件：找到 src/config/index.ts（编译后是 src/config/index.js）
    ↓
2. 加载文件：读取文件内容
    ↓
3. 解析文件：理解里面的代码
    ↓
4. 执行文件：运行 config/index.ts 中顶层的代码（包括 import "dotenv/config"）
    ↓
5. 提取导出：把 loadConfig 函数"拿过来"给 src/index.ts 用
    ↓
6. 缓存：下次再 import 同一个文件，直接从缓存拿，不会重新执行
```

**所以当 `src/index.ts` 被执行时，`config/index.ts` 已经在背后被完整执行过一次了。** 这意味着 `import "dotenv/config"`（读取 .env 文件）也已经在背后执行完了。

---

# 第三章：main() 函数体——五步组装生产线

## 3.1 `async function main(): Promise<void>` —— 为什么 main 是 async 的？

```typescript
async function main(): Promise<void> {
  // ...
  await chat.start();   // ← 里面有 await！
}
```

`main()` 被声明为 `async` 是因为它里面要调用 `await chat.start()`。而 `chat.start()` 是 `async` 的（因为要等待用户输入，要等待 Agent 回复）。

**不写成 async 会怎样？**

```typescript
// ❌ 如果 main 不是 async
function main(): void {
  chat.start();  // chat.start() 返回 Promise，但我们没 await
  // 程序直接就跑到第 25 行去了！
  // chat.start() 里的循环还没开始跑呢！
}
```

所以 main 必须是 async，这样才能 `await chat.start()`，让程序"停在"聊天循环里。

## 3.2 Step 1：插电源——`loadConfig()`

```typescript
const config = loadConfig();
```

**它做了什么？**

走进 `config/index.ts`，`loadConfig()` 函数：

```typescript
export function loadConfig(): Config {
  const apiKey = process.env.ANTHROPIC_API_KEY;      // 读环境变量
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("ANTHROPIC_API_KEY required");    // 没配？直接报错
  }
  // ...
  return {
    anthropicApiKey: apiKey,
    anthropicModel: model,           // "mimo-v2.5"
    anthropicMaxTokens: maxTokens,   // 100000
    anthropicBaseUrl: "https://api.xiaomimimo.com/anthropic",
  };
}
```

**返回的 `config` 对象：**

```typescript
config = {
  anthropicApiKey: "sk-cendbfial5k1famcfifinfavzu7a3d0xb3w1wjo8reb97vgy",
  anthropicModel: "mimo-v2.5",
  anthropicMaxTokens: 100000,
  anthropicBaseUrl: "https://api.xiaomimimo.com/anthropic",
}
```

**它为什么不需要 `await`？**

因为 `loadConfig()` 只是读取内存中的 `process.env` 对象，不涉及任何 I/O 操作（没有网络、没有磁盘读写——`.env` 已经在程序启动时被 `dotenv` 加载到内存了）。

> **原则：不需要等待的操作，就不要用 async/await。**

## 3.3 Step 2：装发动机——`new LLMClient(config)`

```typescript
const client = new LLMClient(config);
```

**走进 `llm/client.ts` 的构造函数：**

```typescript
export class LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: Config) {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
      baseURL: config.anthropicBaseUrl,
    });
    this.model = config.anthropicModel;
    this.maxTokens = config.anthropicMaxTokens;
  }
}
```

**它做了什么？**
1. 创建了一个 `Anthropic` SDK 客户端（配置 API Key 和地址）
2. 记住了模型名称和最大 token 数

**注意**：`new Anthropic({...})` 只是创建了一个客户端对象，**还没有发网络请求**。真正的网络请求在调用 `client.complete()` 时才会发生。

### 用汽车比喻

```
Step 1: loadConfig()
  → 检查油箱有没有油，仪表盘亮不亮
  → 返回："油箱有油，仪表正常"

Step 2: new LLMClient(config)
  → 把发动机装到车上
  → 但没有点火，只是装好了
```

## 3.4 Step 3：组装车身——`new Agent(client, {...})`

```typescript
const agent = new Agent(client, {
  systemPrompt:
    "You are a helpful coding assistant. " +
    "You have access to a bash tool that can execute shell commands. " +
    "Use it when needed to help the user. Answer concisely.",
  tools: ALL_TOOLS,
});
```

**走进 `agent/index.ts` 的构造函数：**

```typescript
export class Agent {
  private client: LLMClient;
  private systemPrompt: string;
  private messages: Message[];     // 对话历史
  private state: AgentState;       // 状态："idle" 或 "thinking"
  private tools: Tool[];           // 工具列表

  constructor(client: LLMClient, config: AgentConfig) {
    this.client = client;
    this.systemPrompt = config.systemPrompt;  // 保存系统提示词
    this.messages = [];                       // 对话历史初始为空
    this.state = "idle";                      // 初始状态：空闲
    this.tools = config.tools || [];          // 保存工具列表
  }
}
```

**创建后的 Agent 对象状态：**

```
┌────────────────────────────────────────┐
│ Agent 实例                              │
│                                        │
│  client:      LLMClient 实例 ────────→ 可以调用 LLM                   │
│  systemPrompt: "You are a helpful..."  │  Agent 的"人设"
│  messages:     []                       │ 对话历史（空的）
│  state:        "idle"                   │ 状态：空闲
│  tools:        [bashTool]              │ 工具有：bash
└────────────────────────────────────────┘
```

**注意**：这里只创建了对象，还没有任何对话发生。`messages` 是空的，`state` 是 `"idle"`。

### 为什么把 systemPrompt 写死在代码里，而不是从配置文件读？

这是一个设计选择。`systemPrompt` 是 Agent 的"人设"，它跟代码逻辑紧密相关。一般来说：
- **跟业务逻辑相关的配置**（API Key、模型名）→ 放 `.env`
- **跟 Agent 行为相关的配置**（systemPrompt）→ 写代码里

如果将来你想让用户自定义 systemPrompt，可以把它也挪到配置里。

## 3.5 Step 4：装驾驶舱——`new Chat(agent)`

```typescript
const chat = new Chat(agent);
```

**走进 `chat/index.ts` 的构造函数：**

```typescript
export class Chat {
  private agent: Agent;
  private rl: readline.Interface;
  private closed: boolean = false;

  constructor(agent: Agent) {
    this.agent = agent;

    this.rl = readline.createInterface({
      input: process.stdin,    // 从键盘读
      output: process.stdout,  // 往屏幕写
    });
    this.rl.on("close", () => {
      this.closed = true;
    });
  }
}
```

**它做了什么？**
1. 记住 Agent 实例（后面要调用它）
2. 创建 readline 接口（绑定到标准输入输出）
3. 监听关闭事件（防止管道输入时报错）

**这个 `rl` 是什么？**

`readline.createInterface` 是 Node.js 内置模块，作用就是：**在终端里读取用户的输入**。

```typescript
this.rl.question("You: ", (answer) => {
  // 用户输入完了，answer 就是用户打的内容
});
```

> 对应到 Java：类似 `Scanner scanner = new Scanner(System.in); String input = scanner.nextLine();`
> 对应到 Python：类似 `input("You: ")`

## 3.6 Step 5：点火启动——`await chat.start()`

```typescript
await chat.start();
```

**走进 `chat/index.ts` 的 start 方法：**

```typescript
async start(): Promise<void> {
  console.log("=== Agent Ready ===");
  console.log("Type 'exit' to quit, 'clear' to reset history.\n");

  while (true) {                             // ← 无限循环！
    const input = await this.ask("You: ");    // ← 等待用户打字

    // 特殊命令
    if (input === "exit") break;              // 退出
    if (input === "clear") {                  // 清空历史
      this.agent.clear();
      continue;
    }

    // 打印 Agent 当前状态
    const status = this.agent.getStatus();
    console.log(`[status: ${status.state}, messages: ${status.messageCount}]`);

    // 核心：把用户输入交给 Agent，等回复
    const response = await this.agent.chat(input);
    console.log(`Agent: ${response}\n`);
  }

  this.rl.close();  // 退出循环后关闭 readline
}
```

**这个 `await chat.start()` 就是整个程序的"主循环"。只要不输入 `exit`，它永远不会返回。** 这就是 `main()` 需要 `await` 的原因——它在等这个无限循环结束。

> **`await chat.start()` 就像是说："车已经启动了，让它在路上跑着吧。"**
> `chat.start()` 永远不会主动结束，除非用户说"exit"。

---

# 第四章：main().catch()——程序的"安全气囊"

```typescript
main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

## 4.1 为什么需要 `.catch()`？

因为 `main()` 是 `async` 的，它返回一个 `Promise<void>`。

**如果没有 `.catch()`：**

```typescript
// 写法 A：没有错误处理
main();  // 如果 main 内部抛异常 → 静默失败！
// 可能什么都看不到，程序就默默退出了
```

**`.catch()` 的作用**：捕获 `main()` 内部任何未被处理的异常。

### 对比 Java 和 Python

```java
// Java：main 里抛异常直接打到控制台
public static void main(String[] args) {
    // 如果这里抛异常，JVM 会打印堆栈并退出
}
```

```python
# Python：main 里抛异常也直接打到控制台
def main():
    # 如果这里抛异常，解释器会打印堆栈
```

```typescript
// TypeScript：async main 的异常被吞进 Promise 里，必须手动 catch
async function main() {
  throw new Error("出错了");
}

main();  // ❌ 没人 catch，异常被静默吞噬！
// → Node.js 会打印 "UnhandledPromiseRejectionWarning"
// → 但程序可能还挂着

main().catch(err => {
  console.error("Fatal:", err);   // ✅ 打印错误
  process.exit(1);                // ✅ 强制退出（状态码 1 表示"异常退出"）
});
```

**关键区别**：async 函数的异常不会直接抛出到调用栈，而是被 Promise "装起来"了。如果不 `.catch()`，它就是一个"未处理的 Promise 拒绝"（Unhandled Promise Rejection）。

## 4.2 `process.exit(1)` 是什么意思？

```typescript
process.exit(1);
```

- `process.exit()` = 告诉 Node.js "程序结束"
- 参数 `1` = **退出码（exit code）**。按惯例：
  - `0` → 正常退出
  - `1` → 异常退出（出错了）
  - 其他数字 → 不同的错误类型

在终端里可以检查退出码：

```bash
npx tsx src/index.ts
echo $?  # 打印上一条命令的退出码
# 如果正常退出 → 0
# 如果出错退出 → 1
```

## 4.3 小程序：没有 .catch() 和 .catch() 的区别

```typescript
// ❌ 没有 .catch()
async function main() {
  throw new Error("API Key not found");
}
main();
// 控制台打印：UnhandledPromiseRejectionWarning: Error: API Key not found
// 但程序不会自动退出（可能还挂着）


// ✅ 有 .catch()
async function main() {
  throw new Error("API Key not found");
}
main().catch(err => {
  console.error("Fatal:", err);   // "Fatal: Error: API Key not found"
  process.exit(1);                // 强制退出
});
```

---

# 第五章：全链路跟练——从开机到关机

现在我们模拟一次完整的运行过程。

## 场景：用户在终端执行 `npx tsx src/index.ts`

### 阶段 0：Node.js 启动

```
$ npx tsx src/index.ts

1. Node.js 找到 src/index.ts
2. 开始解析文件
```

### 阶段 1：import 阶段（采购零件）

```
执行到 import 行 → 开始加载依赖模块：

① import { loadConfig } from "./config/index.js"
   → 加载 config/index.ts
   → 执行 import "dotenv/config"（读取 .env，把 ANTHROPIC_API_KEY 等塞进 process.env）
   → 提取 loadConfig 函数

② import { LLMClient } from "./llm/client.js"
   → 加载 llm/client.ts
   → 加载 llm/types.ts（因为 client.ts import 了 types）
   → 提取 LLMClient 类

③ import { Agent } from "./agent/index.js"
   → 加载 agent/index.ts
   → 加载 agent/types.ts
   → 加载 tools/types.ts
   → 提取 Agent 类

④ import { Chat } from "./chat/index.js"
   → 加载 chat/index.ts
   → 提取 Chat 类

⑤ import { ALL_TOOLS } from "./tools/index.js"
   → 加载 tools/index.ts
   → 加载 tools/bash.ts
   → 加载 tools/types.ts（已在步骤③加载过，从缓存取）
   → 提取 ALL_TOOLS 数组
```

### 阶段 2：main() 函数定义

```
⑥ 定义 async function main() 
   → 目前只是定义了，还没执行
```

### 阶段 3：main() 调用（开机）

```
⑦ main()
   ↓
  Step 1: loadConfig()
          → 从 process.env 读 API Key、Model 等
          → 返回 config 对象
          ↓
  Step 2: new LLMClient(config)
          → 创建 Anthropic SDK 客户端
          → 保存模型配置
          ↓
  Step 3: new Agent(client, { systemPrompt, tools: ALL_TOOLS })
          → systemPrompt = "You are a helpful coding assistant..."
          → messages = []
          → state = "idle"
          → tools = [bashTool]
          ↓
  Step 4: new Chat(agent)
          → 创建 readline 接口
          ↓
  Step 5: await chat.start()
          → 终端显示：
            === Agent Ready ===
            Type 'exit' to quit, 'clear' to reset history.

            You:        ← 等待用户输入
```

### 阶段 4：用户输入 "list files"

```
chat.start() 内部：

  ① await this.ask("You: ")
     → 等待用户在键盘打字
     → 用户输入 "list files"，按回车
     → input = "list files"

  ② input 不是 "exit" 也不是 "clear"

  ③ const response = await this.agent.chat("list files")
     ↓
     agent/index.ts chat() 方法：
       → messages.push({ role: "user", content: "list files" })
       → 进入 while 循环（第 1 轮）
         → buildToolDefinitions()
         → await client.complete(systemPrompt, messages, [bash 定义])
           ↓
           llm/client.ts：
             → HTTPS 请求到 https://api.xiaomimimo.com/anthropic
             → streaming 解析
             → LLM 回复：
               - text: "我来帮你查看一下当前目录"
               - tool_use: { name: "bash", input: { command: "ls" } }
           ↓
         → messages.push(assistant 消息)
         → 发现 toolUses.length > 0
         → 遍历 toolUses
           → findTool("bash") → 找到 bashTool
           → await bashTool.execute({ command: "ls" })
             ↓
             bash.ts：
               → await import("node:child_process")
               → exec("ls", { timeout: 30000 })
               → 子进程执行 ls
               → stdout = "src/\ndist/\n..."
               → resolve("src/\ndist/\n...")
           ↓
         → messages.push(tool_result)
         → 继续循环（第 2 轮）
           → await client.complete(...)
           → LLM 看到 ls 结果
           → 回复："当前目录有 src/、dist/ 等文件夹..."
           → toolUses.length === 0 → 退出循环
           → return "当前目录有 src/、dist/ 等文件夹..."
     ↓
  ④ response = "当前目录有 src/、dist/ 等文件夹..."

  ⑤ console.log("Agent: 当前目录有 src/、dist/ 等文件夹。\n")

  ⑥ 回到 while 循环开头
     → 等待下一次输入
```

### 阶段 5：用户输入 "exit"

```
  chat.start() 内部：

  ① await this.ask("You: ")
     → 用户输入 "exit"

  ② input === "exit" → break
     → 跳出 while 循环

  ③ this.rl.close()
     → 关闭 readline

  chat.start() 结束，返回 void
  ↓
main() 中 await chat.start() 完成
  ↓
main() 结束
  ↓
程序正常退出（退出码 0）
```

---

# 第六章：为什么这样设计？——入口文件的哲学

## 6.1 "薄入口"原则

看 `src/index.ts` 的特点：

```
✅ 非常薄（只有 28 行）
✅ 不做任何业务逻辑
✅ 只做"组装"和"启动"
✅ 每一层的创建都只有一两行
```

**这就是"薄入口"（Thin Entry）原则。** 入口文件只负责：
1. 把各个模块"拼"起来
2. 启动主循环
3. 捕获全局错误

**不应该放在入口文件的事：**
- 业务逻辑（应该放各自的模块里）
- 复杂的配置处理（应该放 config 模块）
- 工具实现（应该放 tools 模块）

### 对比坏的设计

```typescript
// ❌ 坏设计：入口文件太厚
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("...");   // 配置验证应该在 config 模块

  const client = new Anthropic({ apiKey });

  const rl = readline.createInterface(...);  // 聊天逻辑应该在 chat 模块

  while (true) {
    const input = await new Promise(resolve => rl.question("You: ", resolve));
    // 业务逻辑全堆在这里
    const response = await client.messages.create({ ... });
    console.log(response.content);
  }
}
```

## 6.2 依赖注入（Dependency Injection）的雏形

```typescript
// src/index.ts
const config = loadConfig();
const client = new LLMClient(config);    // ← 把 config 注入 client
const agent = new Agent(client, {...});   // ← 把 client 注入 agent
const chat = new Chat(agent);            // ← 把 agent 注入 chat
```

**每一层都不自己创建依赖，而是由上一层"注入"进来。** 这叫**依赖反转**——高层模块不依赖底层模块的具体实现，而是依赖抽象接口。

**好处在哪里？** 测试的时候：

```typescript
// 测试：可以注入一个"假"的 LLMClient，不用真的调用 API
const mockClient = new MockLLMClient();  // 假的 LLM
const agent = new Agent(mockClient, {    // 注入假的
  systemPrompt: "...",
  tools: ALL_TOOLS,
});
// 现在测试 agent 不会真的调用 API！
```

### 对比 Python 的"直接创建"

```python
# Python 常见写法：直接在类里创建依赖
class Agent:
    def __init__(self):
        self.client = AnthropicClient()  # ← 硬编码，没法替换

class Chat:
    def __init__(self):
        self.agent = Agent()  # ← 硬编码，没法替换
```

而在本项目中：

```typescript
// 依赖从外部注入，Agent 不知道 client 是怎么创建的
class Agent {
  constructor(client: LLMClient, config: AgentConfig) {
    this.client = client;  // ← 外部传入，Agent 不关心怎么创建的
  }
}
```

## 6.3 为什么用函数调用而不是类？

```typescript
// 本项目的模式：函数 + 类实例化
const config = loadConfig();        // 函数调用
const client = new LLMClient(config);  // new 类
const agent = new Agent(client, {...}); // new 类
const chat = new Chat(agent);      // new 类
```

可以看作是**一条生产线**：

```
loadConfig()         →  生产配置
new LLMClient(config)  →  用配置生产 LLM 客户端
new Agent(client)      →  用客户端生产 Agent
new Chat(agent)        →  用 Agent 生产聊天界面
await chat.start()     →  启动
```

**每个步骤的产出就是下一步的输入。** 清晰、可测试、可替换。

---

# 附录：src/index.ts 与其他 index.ts 的区别

这个项目里有多个 `index.ts`，它们的角色完全不同：

| 文件 | 作用 | 类比 |
|------|------|------|
| `src/index.ts` | **应用入口**，启动整个程序 | 公司大门 |
| `src/agent/index.ts` | Agent 模块的**统一出口**，暴露 Agent 类 | agent 部门的接待台 |
| `src/chat/index.ts` | Chat 模块的**统一出口**，暴露 Chat 类 | chat 部门的接待台 |
| `src/config/index.ts` | Config 模块的**统一出口**，暴露 Config 接口和 loadConfig 函数 | config 部门的接待台 |
| `src/tools/index.ts` | 工具模块的**统一出口**，暴露 ALL_TOOLS、findTool 等 | 工具间的接待台 |

**关键区别：**

```
src/index.ts
  → 它是"真·入口"，程序从这里开始执行
  → 它 import 其他所有模块
  → 它调用 main() 启动一切

src/agent/index.ts、src/chat/index.ts、src/config/index.ts、src/tools/index.ts
  → 它们是"模块出口"，一个文件夹向外界暴露的"窗口"
  → 它们被其他文件 import
  → 它们不启动任何东西
```

> **记住**：**项目根 `src/` 下的 `index.ts`** 是程序启动的地方；**各个子文件夹下的 `index.ts`** 是那个文件夹的"对外统一窗口"。

---

## 用一张图总结全部

```
┌─────────────────────────────────────────────────────────┐
│                     终端用户                              │
│                   npx tsx src/index.ts                   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  src/index.ts（大门）                                     │
│                                                         │
│  import 零件 → main() → .catch() { 安全气囊 }            │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ main() 内部：                                      │  │
│  │                                                    │  │
│  │  const config = loadConfig()                       │  │
│  │    ↓                                               │  │
│  │  const client = new LLMClient(config)              │  │
│  │    ↓                                               │  │
│  │  const agent = new Agent(client, {systemPrompt,    │  │
│  │                               tools: ALL_TOOLS})   │  │
│  │    ↓                                               │  │
│  │  const chat = new Chat(agent)                      │  │
│  │    ↓                                               │  │
│  │  await chat.start()  ← 进入无限聊天循环            │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  chat.start() 内部（无限循环）                            │
│                                                         │
│  while (true) {                                         │
│    input = await ask("You: ")  ← 等用户输入             │
│    response = await agent.chat(input)  ← 等 Agent 回复   │
│    console.log("Agent:", response)                      │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  agent.chat(input) 内部（Agent Loop）                    │
│                                                         │
│  while (turn < 10) {                                    │
│    await client.complete(..., messages, toolDefs)       │
│    if (no tool_use) → return 文本                        │
│    for (每个 tool_use) {                                 │
│      await tool.execute(input)   ← 执行工具              │
│    }                                                    │
│    → 继续循环                                           │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
```

---

**现在你应该能完全看懂 `src/index.ts` 这 28 行了。** 它的核心就是：

> **5 行 import = 备料 → 5 行 main = 组装 → 1 行 .catch = 保险**

整个项目千行代码，但启动入口就这么简单——其他的复杂度都被封装到了各个模块内部。这就是好的项目结构：**入口薄、模块专、职责清**。

还有不清楚的地方，随时说。💡
