# 🔧 Lesson 01c：深入 tools 文件夹——types.ts、index.ts、bash.ts 逐行拆解

> 我们先确定一下——你说的 `tabs.ts` 应该是 **`types.ts`**（自动纠错把它改成 tabs 了吧 😄）。tools 下就三个文件：
> - `types.ts` — 定义"工具长什么样"
> - `bash.ts` — 实现一个具体的工具（bash 命令执行）
> - `index.ts` — 把所有的工具汇总、注册、暴露给外面
>
> 下面我们逐个拆开，每一行都讲清楚。

---

## 目录

- [第一章：先看全景——三个文件怎么配合](#第一章先看全景三个文件怎么配合)
- [第二章：types.ts——"工具"的定义说明书](#第二章typests工具的定义说明书)
- [第三章：bash.ts——具体工具的实现](#第三章bashts具体工具的实现)
   - [3.1 `await import()`：动态加载的秘密](#31-await-import动态加载的秘密)
   - [3.2 `args.command as string`：TypeScript 的类型"强制转"](#32-argscommand-as-stringtypescript-的类型强制转)
   - [3.3 `new Promise(resolve => ...)`：把老式回调包装成现代 Promise](#33-new-promiseresolve--把老式回调包装成现代-promise)
   - [3.4 `exec()`：Node.js 系统函数调用全链路](#34-execnodejs-系统函数调用全链路)
   - [3.5 为什么不 reject？——Agent 风格的错误处理](#35-为什么不-rejectagent-风格的错误处理)
- [第四章：index.ts——工具的中枢神经](#第四章indexts工具的中枢神经)
   - [4.1 `ALL_TOOLS`——工具注册表](#41-all_tools工具注册表)
   - [4.2 `findTool()`——按名字找工具](#42-findtool按名字找工具)
   - [4.3 `buildToolDefinitions()`——给 LLM 看的"说明书"](#43-buildtooldefinitions给-llm-看的说明书)
- [第五章：三份文件串联——一次完整的工具调用流程](#第五章三份文件串联一次完整的工具调用流程)
- [附录：TypeScript 知识快查](#附录typescript-知识快查)

---

# 第一章：先看全景——三个文件怎么配合

在拆代码之前，先看看这三份文件在**整个项目**中扮演的角色：

```
┌─────────────────────────────────────────────────────────────┐
│                     tools/ 文件夹                             │
│                                                              │
│  types.ts                                                    │
│  ┌─────────────────────────────────┐                         │
│  │ interface Tool {                │  ← 定义"工具"的规格     │
│  │   name: string;                 │    就像一份"产品设计图"  │
│  │   execute: (...) => ...;        │                         │
│  │ }                               │                         │
│  └─────────────────────────────────┘                         │
│           ↑ 被实现                        ↑ 被引用             │
│           │                                │                  │
│  ┌──────────────────┐       ┌──────────────────────────┐     │
│  │ bash.ts          │       │ index.ts                  │     │
│  │ 实现 Tool 接口    │       │ 注册 ALL_TOOLS            │     │
│  │ execute: 调 exec │       │ findTool() 查找           │     │
│  └──────────────────┘       │ buildToolDefinitions()    │     │
│                              └──────────────────────────┘     │
│                                       │                       │
│                                       ▼                       │
│                              agent/index.ts 使用这些函数       │
│                              src/index.ts 注入 ALL_TOOLS      │
└─────────────────────────────────────────────────────────────┘
```

**类比：一家餐厅**

| 文件 | 类比 | 作用 |
|------|------|------|
| `types.ts` | **菜单模板** | 规定"一道菜必须包含：菜名、描述、价格、做法" |
| `bash.ts` | **一道具体的菜** | 鱼香肉丝：按照菜单模板实现了"菜名=鱼香肉丝，描述=...，做法=..." |
| `index.ts` | **前台/菜单本** | 把所有菜汇总成一册，客人（Agent）翻菜单点菜，前台（index.ts）负责上菜 |

---

# 第二章：types.ts——"工具"的定义说明书

**文件：`src/tools/types.ts`（只有 12 行）**

```typescript
export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<string>;
}
```

> ⚠️ 注意：`input_schema` 的 `s` 是 **schema** 的缩写，不是 `scheme`。`input_schema` = "输入参数的格式定义"。

## 2.1 逐字段解释

### `name: string` —— 工具的名字

```typescript
// 在 bash.ts 里的实际值：
name: "bash"
```

LLM 通过这个名字来识别工具。当 LLM 说"我想调用 `bash` 工具"时，它就是在说这个名字。

### `description: string` —— 给 LLM 看的"说明书"

```typescript
// 在 bash.ts 里的实际值：
description:
  "Execute a shell command in a working directory. " +
  "Use this to run commands like `ls`, `cat`, `grep`, `pwd`, etc. " +
  "Returns the command output as text.",
```

**这个字段极其重要**——LLM 就是通过 description 来判断"什么时候该用这个工具"的。

> 写得好："当你需要查看文件内容时，用这个工具"
> 写得不好："一个工具"
>
> description 写得越清楚，LLM 调用得越准。这是 Agent 工程中的一门艺术。

### `input_schema` —— 工具的"参数表单"

告诉 LLM："调用我这个工具时，你需要传什么参数？"

```typescript
input_schema: {
  type: "object",                                          // 参数是一个对象
  properties: {                                            // 对象有哪些属性
    command: {
      type: "string",                                      // command 是字符串
      description: "The shell command to execute",         // 它的说明
    },
  },
  required: ["command"],                                   // command 是必填的
}
```

**LLM 看到后就知道**："哦，调用 bash 需要传一个 `command` 参数，它是字符串，必填。"

### `execute` —— 真正的执行函数

```typescript
execute: (args: Record<string, unknown>) => Promise<string>
//         ↑ 接收参数对象          ↑ 返回一个 Promise，最终拿到字符串结果
```

- **输入**：`{ command: "ls" }`（就是 LLM 根据 `input_schema` 生成的参数）
- **输出**：`Promise<string>` —— 一个"将来会拿到字符串"的承诺
- **为什么不直接返回 `string`？** 因为执行 Shell 命令是耗时的，需要异步等待。返回 `Promise` 才能 `await`。

## 2.2 为什么 types.ts 只有接口没有实现？

对比 Java 你就能理解了：

```java
// Java 接口（对应 types.ts）
public interface Tool {
    String getName();
    String getDescription();
    JsonObject getInputSchema();
    String execute(Map<String, Object> args);
}

// Java 实现类（对应 bash.ts）
public class BashTool implements Tool {
    @Override
    public String execute(Map<String, Object> args) {
        // 实际执行逻辑
    }
}
```

**`types.ts` = Java 的 `interface` 定义文件**。它只规定"你必须有什么"，不规定"你怎么做"。

> 🎯 **`types.ts` 的核心作用**：让所有工具遵循同一个"契约"。只要实现了这个接口，Agent 就可以统一地调用它们——不管背后是执行 Shell 命令、读文件、还是发网络请求。

---

# 第三章：bash.ts——具体工具的实现

**文件：`src/tools/bash.ts`（34 行，但每行都有货）**

```typescript
import type { Tool } from "./types.js";

export const bashTool: Tool = {
  name: "bash",
  description: "Execute a shell command...",
  input_schema: { ... },
  execute: async (args: Record<string, unknown>) => {
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

我们来拆开每一块。

## 3.1 `await import()`：动态加载的秘密

```typescript
const { exec } = await import("node:child_process");
```

### 这不是普通的 import

通常我们这样导入模块：

```typescript
import { exec } from "node:child_process";  // 静态导入：写在文件顶部
```

但这里用的是 `await import()` —— **动态导入**。

### 区别在哪？

```typescript
// 方式 A：静态导入（文件顶部）
import { exec } from "node:child_process";
// → 文件一加载，Node.js 就加载 child_process 模块
// → 即使你永远不调用 execute，这个模块也被加载了

// 方式 B：动态导入（函数内部）
execute: async (args) => {
  const { exec } = await import("node:child_process");
  // → 只有真正执行 execute 时，才加载 child_process 模块
  // → 如果你从不调用这个工具，就省了一次加载
}
```

### 为什么用动态导入？

**性能和资源优化**。想想看——如果以后你有 20 个工具（bash、read_file、write_file、git、npm、docker……），每个工具都静态导入自己的依赖：

```typescript
// ❌ 如果全部静态导入
import { exec } from "node:child_process";  // bash 工具用
import { readFile } from "node:fs";          // read 工具用
import { createClient } from "some-sdk";     // 某个工具用

// → 启动时全部加载，哪怕只用其中一两个
```

用动态导入：

```typescript
// ✅ 动态导入：用到的才加载
bashTool.execute = async (args) => {
  const { exec } = await import("node:child_process");  // 用到时加载
};

readTool.execute = async (args) => {
  const { readFile } = await import("node:fs/promises"); // 用到时加载
};
```

### 这个 `await` 在等什么？

它在等 Node.js **加载并编译 `child_process` 模块**。虽然这个模块通常很快（毫秒级），但因为是磁盘 I/O，所以用 `await` 等待——这就是本节目前面讲的"任何 I/O 操作都需要 async/await"。

**好比你打电话叫外卖：**

```
await import("node:child_process")
→ 你打电话给餐厅："我要一个 child_process 模块"
→ 餐厅：稍等，我去厨房拿（磁盘读取 + 编译）
→ 餐厅：好了，给你（import 完成）
→ 你拿到 exec 函数，继续执行
```

## 3.2 `args.command as string`：TypeScript 的类型"强制转"

```typescript
const command = args.command as string;
```

### 为什么需要 `as string`？

回头看一下 `execute` 的类型签名：

```typescript
execute: (args: Record<string, unknown>) => Promise<string>
//                    ↑ 值的类型是 unknown，不是 string
```

`Record<string, unknown>` 的意思是"键是字符串，值不确定类型"。所以 `args.command` 的类型是 `unknown`（未知类型）。

**`unknown` 是 TypeScript 类型系统中比 `any` 更安全的选择：**

```typescript
// any：想干啥干啥，TypeScript 不检查
const x: any = "hello";
x.toFixed();     // 编译通过，运行时炸了（string 没有 toFixed 方法）

// unknown：必须证明类型后才能操作
const y: unknown = "hello";
y.toFixed();     // ❌ 编译错误！"y 是 unknown 类型"
(y as string).toFixed();  // 还是编译通过...但至少你显式说了"我假装它是 string"
```

### `as` 不是类型转换

初学者最常犯的误解：**`as` 不是类型转换（cast）**，不会真的把数据变成另一种类型。

```typescript
// ❌ 不是类型转换
const x = 42;
const y = x as string;  // 编译报错！不能把 number as string

// ✅ 只是告诉 TypeScript："相信我，我知道它的类型"
const value: unknown = "hello";
const length = (value as string).length;  // "我保证 value 是 string"
```

**它像什么？** 像你给 TypeScript 写了一张"保证书"：

> "亲爱的 TypeScript 编译器，我——开发者——向你保证，`args.command` 一定是 `string` 类型。如果运行时不是，我承担责任。"
>
> —— `as string` 保证书

在实际运行中，`args.command` 确实是 `string`——因为它是 LLM 根据 `input_schema` 生成的正确参数。所以这个 `as` 是安全的。

## 3.3 `new Promise(resolve => ...)`：把老式回调包装成现代 Promise

```typescript
return new Promise((resolve) => {
  exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
    if (error) {
      resolve(`Error: ${error.message}\nstderr: ${stderr}`);
    } else {
      resolve(stdout || stderr || "(no output)");
    }
  });
});
```

### `new Promise(executor)` —— Promise 构造器

```typescript
new Promise((resolve, reject) => {
  // 在这里做耗时的事情...
  // 做完了 → 调用 resolve(结果)
  // 失败了 → 调用 reject(错误)
})
```

Promise 的构造函数接收一个**执行器函数 (executor)**，这个函数有两个参数：

| 参数 | 含义 | 类比 |
|------|------|------|
| `resolve` | "我完成了，这是结果" | 外卖到了，按门铃 |
| `reject` | "我失败了，这是原因" | 外卖小哥打电话说店关了 |

### 把 `exec` 包装进 Promise

`exec` 是 Node.js 的回调风格函数。它的签名是：

```typescript
exec(command, options, (error, stdout, stderr) => {
  // 命令执行完后，Node.js 调用这个回调函数
});
```

回调风格的问题是**没法 `await`**。你不能写：

```typescript
// ❌ 不成立——exec 不返回 Promise
const result = await exec("ls");
```

所以我们要用 `new Promise` 把它包一层：

```typescript
return new Promise((resolve) => {
  // exec 本身不返回 Promise，但我们在外面包了一层 Promise
  exec("ls", (error, stdout) => {
    // 当 exec 完成时，调用 resolve
    resolve(stdout);
  });
});
// ↑ 整个表达式返回 Promise<string>
// 所以外面可以用 await 拿到结果
```

### 画个时间线

```
时间 →
──────┼─────────────────────────────────────────────►

第 1 行：return new Promise((resolve) => {
        ↑ 创建一个 Promise 对象，立即返回
        ↑ Promise 的状态是 "pending"（等待中）

第 2 行：  exec("ls", ..., (error, stdout) => {
        ↑ 调用 exec，开始执行 ls 命令
        ↑ exec 在后台运行（不阻塞！）

... 几毫秒后，ls 命令执行完了 ...

第 3 行：    resolve(stdout)
        ↑ 调用 resolve，把结果塞进 Promise
        ↑ Promise 的状态变成 "fulfilled"（已完成）
        ↑ 外面的 await 拿到结果，继续执行

第 4 行：  });
第 5 行：});
```

### 为什么只有 `resolve` 没有 `reject`？

注意：这里只传了 `resolve`，没传 `reject`。

```typescript
return new Promise((resolve) => {   // ← 没有 reject！
```

**这是故意设计的。** 看第 26-30 行：

```typescript
if (error) {
  resolve(`Error: ${error.message}\nstderr: ${stderr}`);
  // ↑ 即使出错了，也是 resolve（正常完成），不是 reject（异常）
}
```

**为什么出错也用 resolve？**

因为 Agent 的工作方式是：**工具永远返回字符串给 LLM，让 LLM 自己判断对错。**

| 方式 | 做法 | 结果 |
|------|------|------|
| `reject(error)` | 抛异常 | `agent/index.ts` 的 `catch` 捕获到 → 返回 `[Error] 出错了` → 对话终止 |
| `resolve("Error: ...")` | 正常返回错误字符串 | LLM 看到这个字符串，说"哦，出错了，那我换个命令试试" |

```typescript
// agent/index.ts 第 113-127 行
try {
  const output = await tool.execute(tu.input);      // ← 执行工具
  // 不管 output 是正常结果还是 "Error: not found"，都是正常返回
} catch (err) {
  // 只有 reject 才会走到这里
}
```

**让 LLM 决策 = 用 resolve 返回错误信息。** 这是 Agent 工程的一个核心模式。

## 3.4 `exec()`：Node.js 系统函数调用全链路

```typescript
exec(command, { timeout: 30000 }, (error, stdout, stderr) => { ... });
```

### exec 是什么？

`exec` 是 Node.js 内置模块 `child_process` 提供的函数。它的作用是：

> **在当前操作系统上启动一个新的子进程，执行一条 Shell 命令。**

### 从 JavaScript 到操作系统——完整链路

想象你输入 `ls` 命令给 Agent：

```
你的输入："list files"

── Agent 调用 LLM ──
LLM 决定调用 bash 工具，传参 { command: "ls" }

── 进入 bash.ts ──
1. const { exec } = await import("node:child_process")
   ↓
2. exec("ls", { timeout: 30000 }, callback)
   ↓
3. Node.js 内部调用 libuv（跨平台异步 I/O 库）
   ↓
4. libuv 在系统层面调用 fork() + exec()（POSIX 系统）
   或者 CreateProcess()（Windows）
   ↓
5. 操作系统创建一个新进程
   ↓
6. 新进程加载 /bin/ls（或 C:\Windows\System32\ls.exe）
   ↓
7. 新进程执行命令，把输出写到 stdout（标准输出）
   ↓
8. Node.js 回收子进程，收集 stdout/stderr
   ↓
9. 回调函数被调用：callback(null, "src/\ndist/\n...", "")
   ↓
10. resolve("src/\ndist/\n...")
   ↓
11. Agent 拿到结果，返回给 LLM
```

### 用餐厅类比这条链路

```
你（用户）说："我想看看菜单"
          ↓
服务员（LLM）说："好的，我去厨房看看"
          ↓
服务员走去厨房（exec("ls")）
          ↓
厨房（子进程）开始工作
          ↓
厨房喊了一声："今天的菜单有 src/、dist/..."（stdout）
          ↓
服务员听到了，记下来（callback 被调用）
          ↓
服务员走回来跟你说："今天的菜单是..."（resolve）
```

### exec 的参数详解

```typescript
exec(
  command,           // ① 要执行的命令字符串，比如 "ls -la"
  { timeout: 30000 },// ② 选项：30 秒超时
  (error, stdout, stderr) => {
    // ③ 回调：命令执行完后的处理
  }
);
```

**三个参数：**

| 参数 | 含义 | 示例值 |
|------|------|--------|
| `command` | Shell 命令字符串 | `"ls -la"`, `"cat package.json"` |
| `options` | 配置选项 | `{ timeout: 30000, cwd: "/home" }` |
| `callback` | 执行完的回调 | `(error, stdout, stderr) => { ... }` |

**回调的三个参数：**

| 参数 | 类型 | 含义 | 正常时 | 出错时 |
|------|------|------|--------|--------|
| `error` | `Error \| null` | 是否有错误 | `null` | `Error` 对象 |
| `stdout` | `string` | 标准输出（正常结果） | 比如 `"src/\ndist/\n"` | `""` |
| `stderr` | `string` | 标准错误（错误信息） | `""` | 比如 `"ls: no such file"` |

### 关键的 `{ timeout: 30000 }`

```typescript
exec(command, { timeout: 30000 }, ...)
```

这设置了**最大执行时间 30 秒**。如果命令跑了超过 30 秒还没结束，exec 会终止子进程，回调收到一个 timeout 错误。

**为什么需要 timeout？**

想象 LLM 决定执行 `rm -rf /`（删除整个系统），或者 `sleep 10000`（睡 10000 秒）。没有超时限制，你的程序就卡死了。

> **30 秒超时是一个安全阀**——工具不能无限期运行。

## 3.5 为什么不 reject？——Agent 风格的错误处理

再看一次完整的错误处理逻辑：

```typescript
exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
  if (error) {
    // 命令执行出错 → 把错误信息作为"正常结果"返回
    resolve(`Error: ${error.message}\nstderr: ${stderr}`);
  } else {
    // 命令执行成功 → 返回输出
    resolve(stdout || stderr || "(no output)");
  }
});
```

### 对比普通编程的错误处理

**传统方式（Java/Python 风格）：**

```java
// Java: 出错就抛异常
try {
    String result = exec("ls");
    return result;
} catch (Exception e) {
    throw new RuntimeException("命令执行失败", e);
  // ↑ 异常往上抛，调用方处理
}
```

**Agent 方式（本项目的风格）：**

```typescript
// 不管成功还是失败，都返回字符串
// LLM 自己判断这个字符串是"正常结果"还是"错误信息"
const output = await tool.execute({ command: "ls" });
// output 可能是 "src/\ndist/\n..." 也可能是 "Error: command not found"
```

**核心区别：**

```
传统程序：
  命令失败 → 抛异常 → 程序崩溃或进入错误处理分支

Agent：
  命令失败 → 把错误包装成字符串 → 返回给 LLM
            → LLM 看到错误 → 决定下一步
            → "哦，ls 命令不存在？那我试试 dir（Windows）"
```

**这就是 Agent 和普通程序的根本区别：Agent 让 LLM 做决策，代码只负责执行和反馈。**

---

# 第四章：index.ts——工具的中枢神经

**文件：`src/tools/index.ts`（22 行）**

```typescript
import type { Tool } from "./types.js";
import { bashTool } from "./bash.js";

export const ALL_TOOLS: Tool[] = [bashTool];

export function findTool(name: string): Tool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export function buildToolDefinitions() {
  return ALL_TOOLS.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}
```

这个文件是整个 tools 文件夹的**前台 + 控制中心**。三个导出各司其职。

## 4.1 `ALL_TOOLS`——工具注册表

```typescript
export const ALL_TOOLS: Tool[] = [bashTool];
```

**这是一个数组，里面装着所有可用的工具。**

目前只有一个 `bashTool`，以后会这样扩展：

```typescript
export const ALL_TOOLS: Tool[] = [
  bashTool,
  readTool,     // ← 以后加读文件工具
  writeTool,    // ← 以后加写文件工具
  grepTool,     // ← 以后加搜索工具
];
```

### 谁在用 `ALL_TOOLS`？

`src/index.ts`（入口文件）：

```typescript
import { ALL_TOOLS } from "./tools/index.js";

const agent = new Agent(client, {
  systemPrompt: "...",
  tools: ALL_TOOLS,   // ← 把所有工具注入到 Agent
});
```

**Agent 拿到 `ALL_TOOLS` 后**，把它存在 `this.tools` 里。但因为 LLM 需要的工具定义格式跟 `Tool` 接口不完全一样，所以 Agent 不直接用 `ALL_TOOLS` 发给 LLM，而是调用 `buildToolDefinitions()` 做转换。

## 4.2 `findTool()`——按名字找工具

```typescript
export function findTool(name: string): Tool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
```

### 它的作用

当 LLM 说"我要调用 `bash` 工具"时，Agent 需要根据名字"bash"找到对应的工具对象。

**输入输出：**

```typescript
findTool("bash")
// → 返回 bashTool 对象（{ name: "bash", execute: async (...) => {...}, ... }）

findTool("read_file")
// → 返回 undefined（还没注册这个工具）

findTool("不存在的工具")
// → undefined
```

### `Array.find()` 的工作方式

```typescript
// find 是 JavaScript 数组的内置方法
// 它遍历数组，对每个元素调用判断函数
// 第一个返回 true 的元素就被返回

ALL_TOOLS = [
  { name: "bash", execute: ... },
  { name: "read", execute: ... },  // 假设以后有
  { name: "write", execute: ... }, // 假设以后有
];

ALL_TOOLS.find(t => t.name === "bash")
// 遍历：
//   t.name 是 "bash" → "bash" === "bash" → true！返回这个 t
// 结果：{ name: "bash", execute: ... }

ALL_TOOLS.find(t => t.name === "docker")
// 遍历：
//   "bash" === "docker" → false
//   "read" === "docker" → false
//   "write" === "docker" → false
// 没有找到 → 返回 undefined
```

### 谁在调用 `findTool`？

`agent/index.ts` 第 99-109 行：

```typescript
for (const tu of result.toolUses) {
  const tool = findTool(tu.name);  // ← 根据 LLM 要的名字找工具

  if (!tool) {
    // 没找到：告诉 LLM "这个工具不存在"
    toolResultBlocks.push({
      type: "tool_result",
      tool_use_id: tu.id,
      content: `Error: Tool "${tu.name}" not found`,
      is_error: true,
    });
    continue;  // 跳过，处理下一个工具调用
  }

  // 找到了：执行工具
  const output = await tool.execute(tu.input);
  // ...
}
```

### 为什么需要 `findTool`？

**这是一种"解耦"设计**。Agent 不直接知道有哪些工具，而是通过 `findTool` 这个中间人来查找。好处：

```typescript
// 如果不经过 findTool，Agent 可能这样写死：
if (tu.name === "bash") {
  await bashTool.execute(tu.input);
} else if (tu.name === "read") {
  await readTool.execute(tu.input);
} else if (...) {
  // 加一个工具就要改这里
}
// ❌ 每次加新工具都要改 agent/index.ts

// 用 findTool 后，加新工具只需：
// 1. 新建 read.ts
// 2. 在 index.ts 的 ALL_TOOLS 里加 readTool
// → agent/index.ts 不用改一行代码！
// ✅ 开闭原则：对扩展开放，对修改关闭
```

## 4.3 `buildToolDefinitions()`——给 LLM 看的"说明书"

```typescript
export function buildToolDefinitions() {
  return ALL_TOOLS.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}
```

### 为什么不直接把 `ALL_TOOLS` 发给 LLM？

因为 `ALL_TOOLS` 里的每个工具**包含 `execute` 方法**（执行逻辑），LLM 不需要知道这个。LLM 只需要知道工具的**名字、描述、参数格式**。

```typescript
// ALL_TOOLS 里的 bashTool 包含：
{
  name: "bash",
  description: "...",
  input_schema: { ... },
  execute: async (args) => { ... },  // ← LLM 不需要这个！
}

// buildToolDefinitions() 返回的是：
{
  name: "bash",
  description: "...",
  input_schema: { ... },
  // ← 没有 execute！只有 LLM 需要的信息
}
```

### `.map()` 的作用

```typescript
[1, 2, 3].map(x => x * 2)
// → [2, 4, 6]

ALL_TOOLS.map(tool => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.input_schema,
}))
// → [{ name: "bash", description: "...", input_schema: {...} }]
//   ↑ 从每个工具对象中"提取"三个字段，组成新对象
```

### 谁在调用 `buildToolDefinitions`？

`agent/index.ts` 第 62 行：

```typescript
while (turn < maxTurns) {
  const toolDefs = buildToolDefinitions();  // ← 构建 LLM 可读的工具定义

  const result = await this.client.complete(
    this.systemPrompt,
    this.messages,
    toolDefs.length > 0 ? toolDefs : undefined  // ← 传给 LLM
  );
}
```

**整个链路：**

```
buildToolDefinitions()
    ↓
返回 [{ name, description, input_schema }, ...]
    ↓
传给 client.complete(..., toolDefs)
    ↓
LLM 看到这些定义 → 决定要不要用工具
    ↓
如果 LLM 决定用 → 返回 tool_use：{ name: "bash", input: { command: "ls" } }
    ↓
Agent 收到 → findTool("bash") → 找到 bashTool
    ↓
tool.execute({ command: "ls" }) → 执行
    ↓
结果返回给 LLM → 继续决策
```

---

# 第五章：三份文件串联——一次完整的工具调用流程

现在我们把三份文件串起来，看一次完整的工具调用从开始到结束。

## 场景：用户说"看看当前目录有哪些文件"

### 阶段 1：构建工具定义（Agent → tools/index.ts）

```
agent/index.ts 第 62 行：
  const toolDefs = buildToolDefinitions();
                          ↓
tools/index.ts：
  ALL_TOOLS.map(t => ({ name, description, input_schema }))
                          ↓
  返回：[{ name: "bash", description: "Execute a shell...", input_schema: {...} }]
                          ↓
agent/index.ts 第 64 行：
  client.complete(systemPrompt, messages, toolDefs)
                          ↓
  发给 LLM 的请求里包含了工具的"说明书"
```

### 阶段 2：LLM 决定调用工具

```
LLM 看到说明书 → "用户想查看文件，我应该用 bash 工具执行 ls"
LLM 返回：tool_use { name: "bash", input: { command: "ls" } }
```

### 阶段 3：Agent 查找并执行工具（agent → tools/index.ts → tools/bash.ts）

```
agent/index.ts 第 99-114 行：
  for (const tu of result.toolUses) {
    const tool = findTool(tu.name);      // ← 调用 index.ts
                        ↓
    tools/index.ts：
      ALL_TOOLS.find(t => t.name === "bash") → 找到 bashTool
                        ↓
    tool = { name: "bash", execute: async (...) => {...}, ... }

    const output = await tool.execute(tu.input);  // ← 调用 bash.ts
                        ↓
    tools/bash.ts：
      const { exec } = await import("node:child_process");
      exec("ls", { timeout: 30000 }, (err, stdout) => {
        resolve(stdout);  // "src/\ndist/\n..."
      });
                        ↓
    output = "src/\ndist/\n..."
  }
```

### 阶段 4：结果返回给 LLM

```
agent/index.ts 第 131 行：
  messages.push({ role: "user", content: [tool_result] })
                        ↓
  再次调用 client.complete()
                        ↓
  LLM 看到 "src/\ndist/\n..."
  → "当前目录有 src/ 和 dist/ 文件夹"

  LLM 没有新的 tool_use → 退出循环
  → 返回文本给用户
```

---

# 附录：TypeScript 知识快查

## 本课出现的 TypeScript/JavaScript 语法

| 语法 | 出现在哪里 | 一句话解释 |
|------|-----------|-----------|
| `import type { ... }` | types.ts 第 3 行 | 只导入类型，不导入运行时值 |
| `export const ...` | index.ts 第 6 行 | 导出一个常量 |
| `export function ...` | index.ts 第 8 行 | 导出一个函数 |
| `Record<K, V>` | types.ts 第 8 行 | 键为 K 类型、值为 V 类型的对象 |
| `?:` 可选属性 | types.ts 第 9 行 | 这个属性可以不存在 |
| `as string` | bash.ts 第 23 行 | 告诉 TS"我保证它是 string" |
| `new Promise(resolve => ...)` | bash.ts 第 24 行 | 把回调封装成可 await 的形式 |
| `array.find(fn)` | index.ts 第 9 行 | 遍历数组找到第一个匹配的元素 |
| `array.map(fn)` | index.ts 第 17 行 | 遍历数组，每个元素转换后组成新数组 |
| `await import(...)` | bash.ts 第 22 行 | 运行时才加载模块（动态导入） |
| `{ x, y }` 解构赋值 | bash.ts 第 22 行 | 从对象中提取指定字段 |

## tools/ 三个文件的职责速查

| 文件 | 角色 | 类比 | 核心代码数 |
|------|------|------|-----------|
| `types.ts` | **契约定义** | 产品设计图 | 1 个 `interface` |
| `bash.ts` | **具体实现** | 按照设计图造出来的产品 | 1 个 `Tool` 对象 |
| `index.ts` | **注册中心 + 对外接口** | 前台 + 产品目录 | 1 个数组 + 2 个函数 |

## 用生活类比彻底记住

```
types.ts：
  一张表格模板：
  ┌──────────────┬──────────────┐
  │ 字段         │ 类型         │
  ├──────────────┼──────────────┤
  │ 工具名 name  │ string       │
  │ 描述 desc    │ string       │
  │ 参数格式     │ object       │
  │ 执行方法     │ function     │
  └──────────────┴──────────────┘
  ↑ 只规定格式，不填具体内容

bash.ts：
  用上面的模板填了一份：
  ┌──────────────┬───────────────────┐
  │ name         │ "bash"            │
  │ description  │ "Execute shell..." │
  │ input_schema │ { command: ... }   │
  │ execute      │ async (args) =>... │
  └──────────────┴───────────────────┘
  ↑ 一份具体的"简历"

index.ts：
  一个文件夹，里面装着所有填好的表：
  ┌─ 目录 ─────────────────────────┐
  │ 1. bash（来自 bash.ts）         │
  │ 2. read（将来会有）              │
  │ 3. write（将来会有）             │
  └─────────────────────────────────┘
  前台服务：
  - "帮我找叫 bash 的工具" → findTool
  - "把这些工具的描述整理给 LLM" → buildToolDefinitions
```

---

**呼，这次讲完了吧！😄**

总结一下你要带走的核心认知：

1. **`types.ts` = 蓝图**：定义接口，不写实现
2. **`bash.ts` = 产品**：按照蓝图造出来的具体工具
3. **`index.ts` = 前台**：汇总所有工具、提供查找和转换服务
4. **`exec()` 的背后**：JavaScript → Node.js → 操作系统 → 子进程 → 收集结果
5. **`new Promise(resolve => ...)`** = 把回调风格的代码包装成现代异步风格
6. **Agent 风格错误处理**：出错也用 `resolve`，让 LLM 自己决策

还有不清楚的地方吗？随时问，我们一步步把每个角落都照亮 💡
