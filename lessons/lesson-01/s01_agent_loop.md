# s01: Agent Loop — 工具调用核心循环

> 本次修改：让 Agent 具备调用工具的能力，建立 "LLM 决定 → Agent 执行 → 结果返回 → LLM 再决定" 的闭环。

---

## 一、本次改了哪些文件

### 新建文件（3 个）

| 文件 | 作用 |
|------|------|
| `src/tools/types.ts` | 定义 `Tool` 接口：name / description / input_schema / execute |
| `src/tools/bash.ts` | 实现第一个工具 `bash`：执行 shell 命令，返回 stdout/stderr |
| `src/tools/index.ts` | 工具注册中心：ALL_TOOLS 数组、findTool 查找、buildToolDefinitions 生成 LLM 可用的定义 |

### 修改文件（6 个）

| 文件 | 修改内容 |
|------|----------|
| `src/llm/types.ts` | 扩展 `Message` 类型，支持 `ContentBlock[]`（text / tool_use / tool_result）；新增 `ToolDefinition` 类型；`LLMResponse` 新增 `toolUses` 字段 |
| `src/llm/client.ts` | `complete` 方法新增 `tools?: ToolDefinition[]` 参数；处理 streaming 中的 `content_block_start`（tool_use 开始）、`input_json_delta`（累积 JSON 参数）、`content_block_stop`（完成 tool_use） |
| `src/agent/types.ts` | `AgentConfig` 新增 `tools?: Tool[]` 字段，支持通过配置注入工具 |
| `src/agent/index.ts` | **核心重写**：`chat` 方法从单次 LLM 调用改为 **Agent Loop**（最多 10 轮） |
| `src/index.ts` | 注入 `ALL_TOOLS` 到 Agent 配置中 |
| `src/chat/index.ts` | 添加 `closed` 标志，防止管道输入结束后 readline 异常 |

---

## 二、修改的目的是什么

在之前的版本中，Agent 只能进行**单次对话**：用户输入 → 调用 LLM → 返回文本。LLM 无法与外部世界交互（不能执行命令、不能读取文件、不能写入文件）。

s01 的目标是让 Agent 具备**工具调用能力**，实现以下闭环：

```
用户输入
    │
    ▼
  调用 LLM（传入工具定义）
    │
    ├─ 没有 tool_use → 直接回答，结束
    │
    └─ 有 tool_use → 执行工具 → 把结果塞回 messages
                  │
                  └─ 再次调用 LLM
                        │
                        └─ 循环直到 LLM 不再请求工具
```

这是 Agent 的核心骨架。后续所有功能（权限、hooks、多工具、MCP 等）都是在这个 loop 上添加装饰，不会改变 loop 本身的结构。

---

## 三、完成了什么

### 1. 工具层（tools/）

- 定义了 `Tool` 接口，与 Anthropic Messages API 的 `Tool` 定义兼容
- 实现了 `bash` 工具：执行 shell 命令，30 秒超时，返回 stdout/stderr
- 建立了工具注册机制：`ALL_TOOLS` 数组集中管理所有工具

### 2. LLM 层支持工具

- `Message` 类型从 `content: string` 扩展为 `content: string | ContentBlock[]`，支持 Anthropic 的 text / tool_use / tool_result 三种 block
- `client.complete` 可以传入 `tools` 定义，LLM 在响应中会决定是否需要调用工具
- **streaming 解析**：在 `content_block_start` / `content_block_delta` / `content_block_stop` 事件中识别 `tool_use`，逐块累积 JSON 输入参数，最终解析为完整工具调用

### 3. Agent Loop 核心

```typescript
while (turn < maxTurns) {
  // 调用 LLM（传入工具定义）
  const result = await client.complete(systemPrompt, messages, toolDefs);

  // 记录 assistant 消息（文本 + tool_use blocks）
  messages.push({ role: "assistant", content: assistantBlocks });

  // 如果没有 tool_use，直接返回文本给用户
  if (result.toolUses.length === 0) return result.content;

  // 执行每个 tool_use
  for (const tu of result.toolUses) {
    const tool = findTool(tu.name);
    const output = await tool.execute(tu.input);
    toolResultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: output });
  }

  // 把工具结果塞回 messages，继续 loop
  messages.push({ role: "user", content: toolResultBlocks });
}
```

### 4. 验证结果

运行 `printf "list files\nexit\n" | npx tsx src/index.ts`：

```
[Tool] bash {"command":"ls"}
Agent: Here are the files and directories in the current directory:
- dist/
- node_modules/
- src/
- package.json
- package-lock.json
- tsconfig.json
```

Agent 正确识别用户意图，调用 `bash` 工具执行 `ls`，获取输出后返回整理后的回答。

---

## 四、逻辑是什么

### 4.1 数据流

1. **用户输入** → 以 `Message`（`role: "user"`, `content: string`）形式追加到 `messages` 历史
2. **调用 LLM** → 传入 `messages` + `tools` 定义，LLM 根据上下文决定是否需要工具
3. **LLM 响应** → 包含 `text`（解释性文字）和 `tool_use`（工具调用请求）
4. **记录 assistant** → 把 LLM 的 text + tool_use 包装为 `ContentBlock[]`，追加到 `messages`
5. **执行工具** → 遍历每个 `tool_use`，通过 `findTool` 查找对应工具，调用 `execute`，捕获 stdout/stderr
6. **记录 tool_result** → 把每个工具输出包装为 `tool_result` block，追加到 `messages`
7. **循环** → 回到步骤 2，再次调用 LLM。LLM 看到工具结果后，决定继续调用工具或给出最终回答

### 4.2 关键设计决策

**为什么把工具执行放在 Agent 而不是 LLMClient？**

- `LLMClient` 的职责是**发 HTTP 请求**，它不知道工具的业务逻辑
- `Agent` 的职责是**编排对话循环**，它知道如何匹配 tool_use 和 tool 实现、如何塞回结果
- 分离后，换 LLM 提供商（如 OpenAI）不需要改 Agent 代码，只改 LLMClient

**为什么用 ContentBlock 数组而不是纯字符串？**

- Anthropic Messages API 的 `messages` 参数支持 `ContentBlock[]`，这是官方格式
- `tool_use` 和 `tool_result` 必须以结构化 block 形式存在，不能是纯文本
- 使用 `ContentBlock[]` 可以直接传给 SDK，无需额外转换

**为什么最多 10 轮？**

- 防止 LLM 陷入无限工具调用循环（比如反复调用同一个工具）
- 后续可以通过 hooks 或配置调整这个限制
- 10 轮足够完成绝大多数任务（如：读取文件 → 分析 → 写入文件 → 验证）

### 4.3 类型兼容性

我们的 `ContentBlock` 定义与 Anthropic SDK 的 `ContentBlockParam` 结构兼容：

| 我们的类型 | Anthropic SDK 类型 | 兼容性 |
|-----------|-------------------|--------|
| `{ type: "text", text: string }` | `TextBlockParam` | 完全兼容 |
| `{ type: "tool_use", id, name, input }` | `ToolUseBlockParam` | 兼容（`input` 为 `Record<string, unknown>`） |
| `{ type: "tool_result", tool_use_id, content, is_error? }` | `ToolResultBlockParam` | 兼容 |

因此 `messages` 可以直接 `as Anthropic.Messages.MessageParam[]` 传给 SDK，无需手动转换。

### 4.4 后续扩展方向

- s02：添加更多工具（read_file, write_file, edit_file 等）
- s03：在 `PreToolUse` 阶段加入权限检查（阻止 rm -rf / 等危险命令）
- s04：加入 hooks 系统（在 tool 执行前后插入日志、审计等逻辑）
- s05：加入 todo 系统，让 Agent 自主规划任务步骤

---

*核心原则：模型决定调用哪个工具；Agent 负责执行并返回结果。这个 loop 结构从 s01 到 s20 都不会改变。*
