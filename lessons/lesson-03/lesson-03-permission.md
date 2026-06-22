# Lesson 03 — Permission System

> **Motto:** *"Set boundaries first, then grant freedom — check what can run, what must stop, and what needs approval."*

## 概览

前两课我们构建了一个能对话、能调用工具的 Agent。但一个明显的问题是：**Agent 没有任何限制。** LLM 可以调用 `bash("rm -rf /")`、`write({path:"~/.ssh/id_rsa"})`、`bash("npm install malicious-package")`——拿到权限后什么都能做。

Lesson 03 的目标：在 Agent Loop 和工具执行之间插入一道**三闸权限流水线**。整个电脑都在视野内，不只盯着当前项目目录。

```
Lesson 02:  Agent Loop  ──→  Tool.execute()     ← 裸调，无限制

Lesson 03:  Agent Loop  ──→  PermissionPipeline  ──→  Tool.execute()
                                  │
                    ┌─────────────┼──────────────┐
                    ▼             ▼               ▼
               Gate 1         Gate 2          Gate 3
             Deny List      Context Rules    User Approval
            (always block)  (ask if match)   (y/N prompt)
```

## 三闸流水线设计

| 闸门 | 名称 | 行为 | 示例 |
|------|------|------|------|
| Gate 1 | Deny List | 直接拦截，不问用户 | `rm -rf /`, `dd if=...of=/dev/sda` |
| Gate 2 | Context Rules | 匹配后问用户 | 写文件到 workspace 外、`rm file`、`npm install` |
| — | 以上都不匹配 | 放行 | 读 workspace 内的文件、`ls`、`git status` |

```
Gate 1:  rm -rf /          → 直接 deny（永远不该允许）
Gate 2:  rm ./node_modules → ask 用户（可能是有意的清理）
Gate 2:  write ~/.ssh/     → ask 用户（可能是配 SSH，也可能在盗密钥）
```

## 模块结构

```
src/permission/
├── types.ts          # DenyRule, ContextRule, PermissionResult, ApprovalHandler
├── deny-list.ts      # Gate 1: 系统级危险操作
├── context-rules.ts  # Gate 2: 上下文检查规则
├── pipeline.ts       # 三闸流水线编排
└── index.ts          # 统一出口
```

## 代码逐文件解析

### `src/permission/types.ts` — 核心类型

```typescript
import { resolve } from "node:path";

export interface DenyRule {
  name: string;
  description: string;
  tools: string[];
  match: (args: Record<string, unknown>, workdir: string) => string | null;
}

export interface ContextRule {
  name: string;
  description: string;
  tools: string[];
  match: (args: Record<string, unknown>, workdir: string) => string | null;
}

export interface PermissionResult {
  action: "allow" | "deny";
  reason?: string;
  rule?: string;
}

export type ApprovalHandler = (
  toolName: string,
  args: Record<string, unknown>,
  reason: string
) => Promise<boolean>;

export function checkPathScope(path: string, workdir: string, label: string): string | null {
  const resolved = resolve(workdir, path);
  if (!resolved.startsWith(workdir)) {
    return `${label}: ${path} (outside workspace)`;
  }
  return null;
}
```

**两个接口一个签名**

`DenyRule` 和 `ContextRule` 的接口签名完全相同——都有 `name`, `description`, `tools`, `match()`。区别在**语义**上：

- `DenyRule.match()` 返回非 null → **直接拦截，不可覆盖**
- `ContextRule.match()` 返回非 null → **触发 Gate 3，问用户**

用不同的接口名区分而不是用一个接口加一个 `severity` 字段，是因为**它们的消费者不同**——`Pipeline` 对两类规则的处理逻辑完全不同（`deny` 直接 return vs `ask` 回调用户）。TypeScript 的结构类型系统让它们虽然结构相同但可以分开导入。

**`match()` 返回 `string | null` 而非 `boolean`**

```typescript
// 如果返回 boolean：
match: () => boolean   // false 是"不匹配"还是"匹配了但不阻止"？语义模糊

// 我们用的 string | null：
match: () => string | null
// null     = 不匹配，跳过这条规则
// string   = 匹配，这就是拒绝/询问的原因
```

**`checkPathScope()` 路径解析**

```typescript
resolve("/Users/me/project", "src/file.ts")       // → /Users/me/project/src/file.ts       ✓
resolve("/Users/me/project", "../.ssh/id_rsa")    // → /Users/me/.ssh/id_rsa                ✗ 越界
resolve("/Users/me/project", "/etc/hosts")        // → /etc/hosts                            ✗ 越界
resolve("/Users/me/project", "~/.ssh/id_rsa")     // → /Users/me/project/~/.ssh/id_rsa      ✓（~ 不会被展开）
```

`resolve()` 处理了相对路径、绝对路径、`..` 回溯。但 `~` 不会被展开——`~` 是 shell 概念，不是文件系统概念。

**`ApprovalHandler` 回调类型**

```typescript
export type ApprovalHandler = (
  toolName: string,
  args: Record<string, unknown>,
  reason: string
) => Promise<boolean>;
```

这是 Pipeline 和 Chat 之间的**契约接口**。Pipeline 不依赖 Chat，Chat 不依赖 Pipeline，两者都依赖这个 `type`。这称为**依赖倒置（Dependency Inversion）**。

### `src/permission/deny-list.ts` — Gate 1

```typescript
import type { DenyRule } from "./types.js";

export const DESTRUCTIVE_SYSTEM_COMMANDS: DenyRule = {
  name: "destructive-system-commands",
  description: "Never allow commands that can destroy the OS or hardware",
  tools: ["bash"],
  match: (args) => {
    const cmd = (args.command as string) || "";
    const patterns = [
      /^rm\s+-rf\s+\/$/,          // rm -rf /
      /^rm\s+-rf\s+\/\*$/,        // rm -rf /*
      /^dd\s+if=.*of=\/dev\//,    // dd if=...of=/dev/sda
      /^mkfs\./,                   // mkfs.ext4 /dev/sda1
      /^fdisk\s+\/dev\//,         // fdisk /dev/sda
      /^chmod\s+-R\s+0\s+\//,     // chmod -R 0 /
    ];
    for (const p of patterns) {
      if (p.test(cmd.trim())) {
        return `Blocked by "destructive-system-commands": ` +
          `Never allow commands that can destroy the OS or hardware`;
      }
    }
    return null;
  },
};

export const DENY_LIST: DenyRule[] = [DESTRUCTIVE_SYSTEM_COMMANDS];
```

这些模式在任何上下文中都不应该被允许——无论项目目录在哪、无论用户是谁。Gate 1 不经过用户判断，直接拒绝并返回给 LLM。

注意这里 hardcode 了规则名和描述字符串，没有用 `this.name` / `this.description`。因为 `match` 是箭头函数，其 `this` 指向定义时的模块作用域，不是对象字面量本身。

### `src/permission/context-rules.ts` — Gate 2

```typescript
import type { ContextRule } from "./types.js";
import { checkPathScope } from "./types.js";

// 规则 1
export const WRITE_OUTSIDE_WORKSPACE: ContextRule = {
  name: "write-outside-workspace",
  description: "Writing to a location outside the project directory",
  tools: ["write"],
  match: (args, workdir) => {
    const path = (args.path as string) || "";
    return checkPathScope(path, workdir, "Writing outside workspace");
  },
};

// 规则 2
export const READ_OUTSIDE_WORKSPACE: ContextRule = {
  name: "read-outside-workspace",
  description: "Reading a file outside the project directory",
  tools: ["read"],
  match: (args, workdir) => {
    const path = (args.path as string) || "";
    return checkPathScope(path, workdir, "Reading outside workspace");
  },
};

// 规则 3
export const GLOB_OUTSIDE_WORKSPACE: ContextRule = {
  name: "glob-outside-workspace",
  description: "Searching for files outside the project directory",
  tools: ["glob"],
  match: (args, workdir) => {
    const pattern = (args.pattern as string) || "";
    if (pattern.startsWith("/") || pattern.includes("..")) {
      return `Glob pattern may escape workspace: ${pattern}`;
    }
    return null;
  },
};

// 规则 4
export const DESTRUCTIVE_BASH: ContextRule = {
  name: "destructive-bash",
  description: "Command may delete or modify files",
  tools: ["bash"],
  match: (args) => {
    const cmd = (args.command as string) || "";
    const keywords = [
      "rm ", "mv ", "> /etc/", "chmod ", "chown ",
      "dd ", "truncate ", "> /dev/",
    ];
    for (const kw of keywords) {
      if (cmd.includes(kw))
        return `Potentially destructive command: contains "${kw.trim()}"`;
    }
    return null;
  },
};

// 规则 5
export const INSTALL_PACKAGES: ContextRule = {
  name: "install-packages",
  description: "Installing or updating packages",
  tools: ["bash"],
  match: (args) => {
    const cmd = (args.command as string) || "";
    const installers = [
      /^npm\s+(install|add|ci)\b/,
      /^pip\s+install\b/,
      /^yarn\s+(add|install)\b/,
      /^pnpm\s+(add|install)\b/,
      /^brew\s+install\b/,
      /^cargo\s+install\b/,
    ];
    for (const p of installers) {
      if (p.test(cmd.trim())) {
        return `Installing packages: ${cmd.trim().split(/\s+/).slice(0, 3).join(" ")}...`;
      }
    }
    return null;
  },
};

export const CONTEXT_RULES: ContextRule[] = [
  WRITE_OUTSIDE_WORKSPACE,
  READ_OUTSIDE_WORKSPACE,
  GLOB_OUTSIDE_WORKSPACE,
  DESTRUCTIVE_BASH,
  INSTALL_PACKAGES,
];
```

**`includes()` vs `test()` 两种写法**

```typescript
// 简单关键字列表——快速子串匹配
const keywords = ["rm ", "mv ", "> /etc/", "chmod "];
for (const kw of keywords) {
  if (cmd.includes(kw)) return "...";
}

// 正则匹配——更精确的边界控制
const installers = [/^npm\s+(install|add|ci)\b/, /^pip\s+install\b/];
for (const p of installers) {
  if (p.test(cmd.trim())) return "...";
}
```

| | `includes()` | `test()` |
|---|---|---|
| 写法 | 字符串数组 | 正则数组 |
| 精确度 | 子串匹配（"rm " 会配到 "arm "） | 模式匹配，可控制边界 |
| 场景 | 快速简单过滤 | 边界明确的模式 |

### `src/permission/pipeline.ts` — 三闸编排

```typescript
import type { DenyRule, ContextRule, PermissionResult, ApprovalHandler } from "./types.js";

export class PermissionPipeline {
  constructor(
    private readonly workdir: string,
    private readonly denyRules: DenyRule[],
    private readonly contextRules: ContextRule[],
    private onAsk?: ApprovalHandler,
  ) {}

  setApprovalHandler(handler: ApprovalHandler): void {
    this.onAsk = handler;
  }

  async check(toolName: string, args: Record<string, unknown>): Promise<PermissionResult> {
    // Gate 1: Deny list — 直接拦
    for (const rule of this.denyRules) {
      if (!rule.tools.includes(toolName)) continue;
      const reason = rule.match(args, this.workdir);
      if (reason !== null) {
        return { action: "deny", reason, rule: rule.name };
      }
    }

    // Gate 2: Context rules → 匹配则问用户
    for (const rule of this.contextRules) {
      if (!rule.tools.includes(toolName)) continue;
      const reason = rule.match(args, this.workdir);
      if (reason !== null) {
        // Gate 3: 用户确认
        if (this.onAsk) {
          const approved = await this.onAsk(toolName, args, reason);
          if (!approved) {
            return { action: "deny", reason: `User denied: ${reason}`, rule: rule.name };
          }
          return { action: "allow" };
        }
        // 没有回调 = 默认拒绝（fail safe）
        return { action: "deny", reason: `No approval handler: ${reason}`, rule: rule.name };
      }
    }

    return { action: "allow" };
  }
}
```

**`check()` 只看 `allow` / `deny`，不抛 `ask`**

这是和上一版 PermissionGate 的关键区别。`pipeline.check()` 内部处理了所有用户交互——Agent Loop 完全不需要知道 `ask` 的存在，只需要根据 `action === "deny"` 决定是否拦截。

**`readonly` 在构造函数参数中**

```typescript
constructor(
  private readonly workdir: string,   // 声明 + 赋值 + readonly，一行完成
  ...
)
```

等价于：
```typescript
private workdir: string;
constructor(workdir: string) {
  this.workdir = workdir;
}
```
但少写 3 行。`readonly` 确保初始化后不会被意外重赋值。

**`setApprovalHandler` 解决循环引用**

创建顺序：`Pipeline → Agent → Chat → pipeline.setApprovalHandler()`

如果 Pipeline 的构造函数就要求传入 `ApprovalHandler`，那 handler 函数体里要调 `chat.askPermission`——但 Chat 还没创建，因为 Chat 需要 Agent，Agent 需要 Pipeline。setter 打破了这个死锁。

### `src/permission/index.ts` — 统一出口

```typescript
export type { DenyRule, ContextRule, PermissionResult, ApprovalHandler } from "./types.js";
export { DENY_LIST } from "./deny-list.js";
export { CONTEXT_RULES } from "./context-rules.js";
export { PermissionPipeline } from "./pipeline.js";
```

只 re-export 外部需要的内容。`checkPathScope` 是内部工具函数，只在 `context-rules.ts` 中使用，不暴露出去。

### `src/agent/types.ts` — Agent 配置

```typescript
import type { PermissionPipeline } from "../permission/index.js";

export interface AgentConfig {
  systemPrompt: string;
  tools?: Tool[];
  pipeline?: PermissionPipeline;    // ← 新增
}
```

`pipeline` 是可选的（`?`），不加时 Agent 行为回到 Lesson 02 的无权限模式。这是兼容性设计——不会因为没配 Pipeline 就报错。

### `src/agent/index.ts` — Agent Loop 的改动

Agent 类新增一个字段：

```typescript
export class Agent {
  // ... 原有字段
  private pipeline?;    // 无显式类型，由构造函数参数推导

  constructor(client: LLMClient, config: AgentConfig) {
    // ...
    this.pipeline = config.pipeline;
  }
```

工具执行循环中的权限检查：

```typescript
// 在 tool.execute() 之前，插一段权限检查
const permResult = await this.pipeline?.check(tu.name, tu.input);
if (permResult && permResult.action === "deny") {
  toolResultBlocks.push({
    type: "tool_result",
    tool_use_id: tu.id,
    content: `${permResult.reason}`,
    is_error: true,
  });
  continue;  // 跳过执行，继续处理下一个 tool_use
}

// 权限通过，正常执行
console.log(`[Tool] ${tool.name} ${JSON.stringify(tu.input)}`);
try {
  const output = await tool.execute(tu.input);
  toolResultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: output });
} catch (err) {
  toolResultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: `Error: ...`, is_error: true });
}
```

**`?.` 操作符**

`this.pipeline?.check(...)` 等价于：
```typescript
this.pipeline === null || this.pipeline === undefined
  ? undefined
  : this.pipeline.check(...)
```

如果不配置 pipeline，Agent 回退到无权限模式，`permResult` 为 `undefined`，`if (permResult && ...)` 短路跳过——**0 行代码改动**。

### `src/chat/index.ts` — ask 回调

```typescript
async askPermission(
  toolName: string,
  args: Record<string, unknown>,
  reason: string
): Promise<boolean> {
  console.log(`\n⚠️  ${reason}`);
  console.log(`   Tool: ${toolName}`);
  console.log(`   Args: ${JSON.stringify(args)}`);
  const answer = await this.ask("   Allow? (y/N): ");
  return answer.trim().toLowerCase() === "y";
}
```

用户看到的实际效果：

```
⚠️  Reading outside workspace: ~/.ssh/id_rsa (outside workspace)
   Tool: read
   Args: {"path":"~/.ssh/id_rsa"}
   Allow? (y/N): n
```

### `src/index.ts` — 入口串联

```typescript
const workdir = process.cwd();
const pipeline = new PermissionPipeline(workdir, DENY_LIST, CONTEXT_RULES);

const agent = new Agent(client, {
  systemPrompt: "You are a helpful assistant. ...",
  tools: ALL_TOOLS,
  pipeline,
});

const chat = new Chat(agent);

pipeline.setApprovalHandler((toolName, args, reason) =>
  chat.askPermission(toolName, args, reason)
);

await chat.start();
```

**`process.cwd()`** 是 Node.js 的当前工作目录——用户打开终端时的所在文件夹。所有路径检查都以它为基准。如果用户在 `/Users/me/my-project` 下运行 `npm start`，那 workspace 就是 `/Users/me/my-project`。

## 架构原则

```
                    PermissionPipeline.check(toolName, args)
                                      │
                              ┌───────▼────────┐
                              │  foreach deny  │ ← Gate 1
                              │  rule.match()  │
                              └───────┬────────┘
                                      │
                    ┌─────────────────┼──────────────────┐
                    ▼                 ▼                   ▼
              deny (match)     null (不匹配)        工具不在 tools 里
              return deny         │                   continue
                                  │
                          ┌───────▼────────┐
                          │  foreach ctx   │ ← Gate 2
                          │  rule.match()  │
                          └───────┬────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    ▼             ▼               ▼
              ask (match)    null (不匹配)    工具不在 tools 里
                    │         return allow      continue
          ┌─────────▼──────────┐
          │  Gate 3: onAsk()   │
          │  onAsk 不存在→deny │
          └─────────┬──────────┘
                    │
              ┌─────┴─────┐
              ▼           ▼
          allow=true  allow=false
          return      return deny
          allow
```

**Gate 1 优先级 > Gate 2**：一条命令如果同时匹配 Gate 1（如 `rm -rf /`）和 Gate 2（如 `rm ` 关键字），Gate 1 先拦截，Gate 2 不会被检查。因为 Gate 1 匹配后直接 return 了。

**fail safe**：如果 `onAsk` 未设置（没调用 `setApprovalHandler`），但 Gate 2 匹配了规则，默认拒绝。永远不默认允许。

## 新增规则

以"删除操作需要确认"为例：

```typescript
// 在 context-rules.ts 末尾添加
export const DELETE_OPERATIONS: ContextRule = {
  name: "delete-operations",
  description: "Deleting files or directories",
  tools: ["bash"],
  match: (args) => {
    const cmd = (args.command as string) || "";
    if (/^rm\s+/.test(cmd.trim())) {
      return `Deleting: ${cmd.trim().split(/\s+/).slice(0, 3).join(" ")}...`;
    }
    return null;
  },
};

// 加入数组
export const CONTEXT_RULES: ContextRule[] = [
  WRITE_OUTSIDE_WORKSPACE,
  READ_OUTSIDE_WORKSPACE,
  GLOB_OUTSIDE_WORKSPACE,
  DESTRUCTIVE_BASH,
  INSTALL_PACKAGES,
  DELETE_OPERATIONS,     // ← 新规则
];
```

**不需要改 Pipeline、Agent、Chat。** 这是**开闭原则**——对扩展开放，对修改封闭。

## 挑战练习

1. **基准级**：当前 `checkPathScope` 用 `startsWith()` 判断路径范围。但 `/project` 和 `/project-backup` 会误判。修复它。提示：在比较时加上尾部分隔符。

2. **进阶级**：给 `write` 工具补充一条规则——禁止写入 `.env` 文件和 `node_modules`。这些应该放在 `deny-list.ts` 还是 `context-rules.ts`？实现它。

3. **设计级**：Gate 2 的规则是顺序检查的，匹配第一条后就去问用户。如果用户批准了，不会继续检查剩下的规则。这是否合理？如果改成"汇总全部匹配原因一次性问用户"，应该怎么改？

4. **反思级**：`Pipeline` 的 `check()` 方法在调用 `onAsk` 时 `await` 了。这意味着整个 Agent Loop 都在等用户输入。如果用户一直不响应，会发生什么？这个设计中谁负责超时控制？

## 小结

本课核心收获：

1. **三闸流水线**：Deny List → Context Rules → User Approval，三级递进
2. **全计算机视野**：`workdir` 作基准，`resolve()` + `startsWith()` 检查任意路径是否越界
3. **Deny vs Ask 分离**：系统级危险直接拦，上下文敏感的操作问用户
4. **回调解循环引用**：`setApprovalHandler()` 打破 Pipeline ↔ Agent ↔ Chat 的依赖环
5. **开闭原则**：新增规则只需加文件 + 注册数组，Pipeline 不改
6. **fail safe**：没有回调时默认拒绝，永远不默认允许

---

*"Set boundaries first, then grant freedom — check what can run, what must stop, and what needs approval."*
