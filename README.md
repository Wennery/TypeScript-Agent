# 🧠 TypeScript Agent — 从零构建 AI Agent

> 一个学习 TypeScript 和 Agent 工程的渐进式项目。
> 从最基本的 Agent Loop 开始，逐步添加工具、权限、子 Agent、记忆系统等能力。

## 课程结构

每节课的代码在 `src/` 中持续演进，教学材料按课归档到 `lessons/`。

| 课程 | 主题 | 代码状态 |
|------|------|---------|
| Lesson 01 | Agent 骨架 — Agent Loop、LLM 通信、工具调用 | ✅ 已完成 |
| Lesson 02 | 待定 | ⏳ 进行中 |

## 快速启动

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API Key

# 开发模式（直接运行 TS 源码）
npm start

# 编译并运行
npm run build
npm run start:dist
```

## 项目结构

```
src/
├── index.ts          # 入口：组装所有模块
├── config/           # 配置管理
├── llm/              # LLM 通信层（Anthropic API）
├── agent/            # Agent 核心循环
├── tools/            # 工具系统
└── chat/             # 交互层（CLI）

lessons/
└── lesson-01/        # 第一课教学文档
```

## Tag 索引

每节课完成后打一个 tag，方便回溯：

```bash
git checkout lesson-01    # 查看第一课完成时的代码和文档
git checkout main          # 回到最新状态
```

## 许可证

ISC
