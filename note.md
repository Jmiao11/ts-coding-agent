消息转换主要有 **两条线**：

```text
1. Agent 内部消息 → LLM 标准消息
2. LLM 标准消息 → 某个 Provider 的 API 消息
```

你可以先记住总链路：

```text
用户输入
↓
AgentMessage[]
↓
transformContext()
↓
AgentMessage[]
↓
convertToLlm()
↓
Message[]
↓
toOpenAIMessage()
↓
OpenAI-compatible JSON
↓
真实模型
```

## 1. 用户输入先变成 `UserMessage`

比如你调用：

```ts
await agent.prompt("你好");
```

`Agent.prompt()` 会先把字符串规范化成：

```ts
{
  role: "user",
  content: [
    {
      type: "text",
      text: "你好",
    },
  ],
  timestamp: Date.now(),
}
```

也就是：

```text
string
↓
UserMessage
```

然后它进入：

```text
AgentMessage[]
```

因为 `UserMessage` 本身就是一种 `Message`，而 `Message` 又属于 `AgentMessage`。

---

## 2. `AgentMessage[]` 先经过 `transformContext()`

这是第一层转换：

```text
AgentMessage[]
↓
transformContext()
↓
AgentMessage[]
```

注意：

> 输入输出还是 `AgentMessage[]`

它不是把消息变成 Provider 格式。

它更像“整理 Agent 上下文”。

以后可以做：

```text
压缩历史消息
删除过旧内容
加入摘要
过滤内部消息
调整上下文顺序
```

例如：

```ts
transformContext(messages)
```

输入：

```text
[
  UserMessage,
  AssistantMessage,
  EvidenceMessage,
  UserMessage
]
```

可能输出：

```text
[
  UserMessage,
  AssistantMessage,
  EvidenceMessage,
  UserMessage
]
```

或者以后压缩成更短的 Agent 上下文。

---

# 3. `convertToLlm()`：AgentMessage → Message

这是非常关键的一层：

```text
AgentMessage[]
↓
convertToLlm()
↓
Message[]
```

因为以后 `AgentMessage` 可能包含模型根本不认识的内部消息：

```text
EvidenceMessage
VerificationMessage
InternalMessage
```

所以不能直接发送。

例如 Agent 内部有：

```text
AgentMessage[]

[
  UserMessage,
  EvidenceMessage,
  AssistantMessage
]
```

经过：

```ts
convertToLlm(...)
```

可能得到：

```text
Message[]

[
  UserMessage,
  AssistantMessage
]
```

或者把 `EvidenceMessage` 转成一段普通文本。

所以这一层的职责是：

> 把 Agent 自己的消息世界，转换成 LLM 能理解的统一消息世界。

---

# 4. `Message[]` 再交给 Provider

现在已经得到：

```text
Message[]
```

里面只有：

```text
SystemMessage
UserMessage
AssistantMessage
ToolResultMessage
```

这还不是 OpenAI API 格式。

因为这是我们自己定义的统一协议。

接下来 Provider 做：

```ts
toOpenAIMessage(message)
```

把我们的消息转成 OpenAI-compatible 消息。

---

# 5. `SystemMessage` 怎么转

我们的：

```ts
{
  role: "system",
  content: "You are a coding agent.",
  timestamp: ...
}
```

Provider 转成：

```ts
{
  role: "system",
  content: "You are a coding agent."
}
```

主要就是去掉我们内部的：

```text
timestamp
```

因为 API 不需要。

---

# 6. `UserMessage` 怎么转

我们的：

```ts
{
  role: "user",
  content: [
    {
      type: "text",
      text: "Hello "
    },
    {
      type: "text",
      text: "Agent"
    }
  ],
  timestamp: ...
}
```

先经过：

```ts
messageText(message)
```

变成：

```text
"Hello Agent"
```

再经过：

```ts
toOpenAIMessage()
```

得到：

```ts
{
  role: "user",
  content: "Hello Agent"
}
```

所以：

```text
UserMessage
↓
messageText()
↓
string
↓
toOpenAIMessage()
↓
OpenAI user message
```

---

# 7. `AssistantMessage` 怎么转

我们的：

```ts
{
  role: "assistant",
  content: [
    {
      type: "text",
      text: "你好"
    }
  ],
  provider: "...",
  model: "...",
  stopReason: "stop",
  timestamp: ...
}
```

当前 Provider 会提取文字：

```text
"你好"
```

变成：

```ts
{
  role: "assistant",
  content: "你好"
}
```

注意当前阶段如果里面有：

```ts
ToolCall
```

我们现在还会直接报错，因为 M05 Tool Call 转换还没正式实现。

---

# 8. `ToolResultMessage` 怎么转

我们的：

```ts
{
  role: "toolResult",
  toolCallId: "call_001",
  toolName: "read_file",
  content: [
    {
      type: "text",
      text: "文件内容..."
    }
  ],
  isError: false,
  timestamp: ...
}
```

OpenAI-compatible API 不认识：

```text
role: "toolResult"
```

它要求：

```text
role: "tool"
```

所以转换后：

```ts
{
  role: "tool",
  tool_call_id: "call_001",
  content: "文件内容..."
}
```

这里就是典型的：

```text
我们自己的统一协议
↓
Provider 专属协议
```

---

# 9. 整个消息转换链举例

假设用户说：

```text
读取 package.json
```

最开始：

```text
string
```

变成：

```text
UserMessage
```

进入：

```text
AgentMessage[]
```

然后：

```text
AgentMessage[]
↓
transformContext()
```

上下文整理。

然后：

```text
↓
convertToLlm()
↓
Message[]
```

只保留模型能理解的消息。

然后 Provider：

```text
Message[]
↓
toOpenAIMessage()
↓
OpenAIChatMessage[]
```

最终请求体：

```json
{
  "model": "...",
  "messages": [
    {
      "role": "user",
      "content": "读取 package.json"
    }
  ],
  "stream": true
}
```

---

## 10. 模型返回时又是反方向

请求是：

```text
AgentMessage
→ Message
→ Provider Message
```

响应则是：

```text
Provider SSE JSON
↓
parseOpenAIStreamData()
↓
text_delta
↓
AssistantMessageEvent
↓
逐步构造 AssistantMessage
↓
加入 AgentMessage[]
```

比如模型连续返回：

```text
"你"
"好"
```

Provider 解析成：

```text
text_delta("你")
text_delta("好")
```

然后累积：

```text
"你"
↓
"你好"
```

最后得到：

```ts
AssistantMessage
```

再存回：

```text
AgentMessage[]
```

所以完整闭环是：

```text
AgentMessage[]
↓
Message[]
↓
Provider API Message
↓
真实模型
↓
Provider SSE
↓
AssistantMessageEvent
↓
AssistantMessage
↓
AgentMessage[]
```

你可以把它记成一句：

> `AgentMessage` 是 Agent 自己的语言，`Message` 是统一 LLM 语言，Provider Message 是某一家 API 的语言。




这里可以把它拆成 **两次转换**，不要一次看整条链。

```text
Provider SSE JSON
↓
① parseOpenAIStreamData()
↓
ParsedStreamData
↓
② createOpenAICompatibleStreamFn()
↓
AssistantMessageEvent
```

关键点是：

> `parseOpenAIStreamData()` **并没有直接生成 `AssistantMessageEvent`**。

它只是先把“OpenAI 格式”翻译成我们自己的一个中间结果。

---

## 第一步：Provider 发来 SSE JSON

比如百炼/OpenAI-compatible 返回一段：

```text
data: {"choices":[{"delta":{"content":"你"},"finish_reason":null}]}
```

前面的：

```text
data:
```

已经被：

```ts
extractSseData()
```

去掉了。

所以传给：

```ts
parseOpenAIStreamData()
```

的其实是：

```json
{
  "choices": [
    {
      "delta": {
        "content": "你"
      },
      "finish_reason": null
    }
  ]
}
```

---

## 第二步：`parseOpenAIStreamData()`

代码核心是：

```ts
const chunk =
  JSON.parse(data) as OpenAIStreamChunk;
```

先把 JSON 字符串变成 JS 对象。

然后：

```ts
const choice =
  chunk.choices?.[0];
```

拿到：

```ts
{
  delta: {
    content: "你"
  },
  finish_reason: null
}
```

再：

```ts
const content =
  choice.delta?.content;
```

得到：

```text
"你"
```

然后返回：

```ts
{
  type: "text_delta",
  delta: "你",
}
```

注意这里得到的还不是：

```ts
AssistantMessageEvent
```

而是我们自己定义的：

```ts
ParsedStreamData
```

---

## 为什么要多这一层？

因为 OpenAI-compatible 的格式是：

```ts
{
  choices: [
    {
      delta: {
        content: "你"
      }
    }
  ]
}
```

但我们 Agent Core 不应该知道什么：

```text
choices
delta.content
finish_reason
```

这些都是 Provider 细节。

所以先翻译成我们自己的统一语言：

```ts
{
  type: "text_delta",
  delta: "你"
}
```

意思非常简单：

> 模型这次新增了一个 `"你"`。

---

# 第三步：再转成 `AssistantMessageEvent`

这个转换发生在：

```ts
createOpenAICompatibleStreamFn()
```

里面。

例如：

```ts
const parsed =
  parseOpenAIStreamData(data);
```

现在：

```ts
parsed
```

可能是：

```ts
{
  type: "text_delta",
  delta: "你"
}
```

然后进入：

```ts
case "text_delta": {
  fullText += parsed.delta;
}
```

假设之前：

```text
fullText = ""
```

那么现在：

```text
fullText = "你"
```

然后创建一个当前完整的 AssistantMessage：

```ts
const partial =
  createAssistantMessage(
    model,
    fullText,
  );
```

得到：

```ts
{
  role: "assistant",
  content: [
    {
      type: "text",
      text: "你"
    }
  ],
  ...
}
```

最后：

```ts
stream.push({
  type: "text_delta",
  contentIndex: 0,
  delta: parsed.delta,
  partial,
});
```

这时候才真正变成：

```ts
AssistantMessageEvent
```

也就是：

```ts
{
  type: "text_delta",

  delta: "你",

  partial: {
    role: "assistant",
    content: [
      {
        type: "text",
        text: "你"
      }
    ],
    ...
  }
}
```

---

## 再来第二个 chunk

Provider 又发：

```json
{
  "choices": [
    {
      "delta": {
        "content": "好"
      }
    }
  ]
}
```

经过：

```ts
parseOpenAIStreamData()
```

变成：

```ts
{
  type: "text_delta",
  delta: "好"
}
```

然后：

```ts
fullText += "好";
```

现在：

```text
fullText = "你好"
```

于是新的 `AssistantMessageEvent` 是：

```ts
{
  type: "text_delta",
  delta: "好",

  partial: {
    role: "assistant",
    content: [
      {
        type: "text",
        text: "你好"
      }
    ],
    ...
  }
}
```

---

## 所以整个过程实际上是

```text
Provider JSON

{
  choices: [
    {
      delta: {
        content: "你"
      }
    }
  ]
}

↓ parseOpenAIStreamData()

{
  type: "text_delta",
  delta: "你"
}

↓ createOpenAICompatibleStreamFn()

fullText = "你"

↓

AssistantMessageEvent

{
  type: "text_delta",
  delta: "你",
  partial: AssistantMessage("你")
}
```

---

## `ParsedStreamData` 和 `AssistantMessageEvent` 的区别

这个最关键。

### `ParsedStreamData`

只是：

```text
Provider 刚刚发来了什么
```

例如：

```ts
{
  type: "text_delta",
  delta: "你"
}
```

它很轻。

### `AssistantMessageEvent`

是 Agent Core 能理解的正式流事件：

```ts
{
  type: "text_delta",

  delta: "你",

  partial: {
    // 当前完整 AssistantMessage
  }
}
```

它不仅知道：

```text
本次新增 "你"
```

还知道：

```text
到目前为止完整消息是什么
```

---

你可以把这两步记成：

```text
parseOpenAIStreamData()
=
“翻译 Provider”

createOpenAICompatibleStreamFn()
=
“包装成 Agent Core 的流事件”
```

所以不是：

```text
JSON
↓
直接 AssistantMessageEvent
```

而是：

```text
Provider JSON
↓
ParsedStreamData
↓
AssistantMessageEvent
```

中间多这一层，就是为了让 **Provider 协议** 和 **Agent Core 协议** 解耦。




截图中的这些文件分成两组：

```text
agent/   → 负责 Agent 怎么思考、循环、执行工具
ai/      → 负责消息格式、事件流、连接具体模型
```

整体配合关系：

```text
用户
 ↓
agent.ts
 ↓
agent-loop.ts
 ↓
ai/providers/openai-compatible.ts
 ↓
大模型 API
 ↓
event-stream.ts
 ↓
agent-loop.ts
 ↓
agent.ts / UI
```

## 一、`agent` 文件夹

### 1. `agent.ts`：Agent 门面

文件：

```text
src/agent/agent.ts
```

它是外部使用 Agent 的入口，负责：

- 保存模型
- 保存消息
- 保存工具
- 接收用户问题
- 管理取消操作
- 把事件通知给外部
- 启动 Agent Loop

使用时大概是：

```ts
const agent = new Agent({
  initialState: {
    model,
    messages: [],
    tools: [weatherTool],
  },
  loopConfig,
  streamFn,
});

await agent.prompt("北京天气怎么样？");
```

`agent.ts` 本身不负责具体的循环细节，而是把任务交给 `agent-loop.ts`。

可以理解为：

> `agent.ts` 是 Agent 的“门面”和“总控制器”。

---

### 2. `agent-loop.ts`：真正的运行循环

文件：

```text
src/agent/agent-loop.ts
```

它负责 Agent 的核心流程：

```text
接收用户问题
 ↓
准备上下文
 ↓
调用大模型
 ↓
读取模型响应
 ↓
判断是否要调用工具
 ↓
执行工具
 ↓
把工具结果放回上下文
 ↓
再次调用大模型
```

核心逻辑类似：

```ts
while (true) {
  const currentContext = ...;

  const response =
    await streamFn(
      model,
      llmContext,
      streamOptions,
    );

  // 读取模型事件
  // 得到 assistant message

  // 如果有 tool call
  // 执行工具
  // 把工具结果放回 currentContext
}
```

它还负责把完整的 `AgentTool` 转换成 Provider 能看到的工具名片：

```ts
const providerTools =
  currentContext.tools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
```

注意：

```text
AgentTool
= 工具描述 + execute()

Provider Tool
= 工具描述
```

`execute()` 不传给大模型。

可以理解为：

> `agent-loop.ts` 是 Agent 的“大脑循环”和“调度中心”。

---

### 3. `agent/types.ts`：Agent 专用类型

文件：

```text
src/agent/types.ts
```

这里定义 Agent 层的数据结构，例如：

```ts
AgentTool
AgentContext
AgentState
AgentEvent
StreamFn
AgentLoopConfig
```

最重要的是 `AgentTool`：

```ts
type AgentTool = Tool & {
  label: string;

  execute(
    toolCallId,
    parameters,
    signal?,
  ): Promise<AgentToolResult>;
};
```

它表示一个真正可以执行的工具。

例如：

```ts
const weatherTool = {
  name: "get_weather",
  description: "查询天气",
  parameters: schema,
  label: "查询天气",

  execute: async (_id, args) => {
    return {
      content: [
        {
          type: "text",
          text: `${args.city} 今天晴天`,
        },
      ],
    };
  },
};
```

`agent/types.ts` 还定义 `StreamFn`：

```ts
type StreamFn = (
  model,
  context,
  options,
) => AssistantMessageEventStream;
```

它规定：

> 只要一个函数能接收模型和上下文，并返回事件流，它就是一个 `StreamFn`。

---

## 二、`ai` 文件夹

### 4. `ai/types.ts`：模型通信的通用类型

文件：

```text
src/ai/types.ts
```

它定义 Agent 和 Provider 之间共同使用的数据格式。

例如消息：

```ts
Message
SystemMessage
UserMessage
AssistantMessage
ToolResultMessage
```

工具名片：

```ts
Tool
```

模型：

```ts
Model
```

流式配置：

```ts
SimpleStreamOptions
```

响应事件：

```ts
AssistantMessageEvent
```

例如：

```ts
{
  type: "text_delta",
  delta: "你好"
}
```

这里的 `Tool` 只有模型需要看的信息：

```ts
type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};
```

它没有：

```ts
execute()
```

所以两者区别是：

```text
ai/types.ts 的 Tool
→ 给模型看的工具名片

agent/types.ts 的 AgentTool
→ Agent 内部真正能执行的工具
```

---

### 5. `ai/providers/openai-compatible.ts`：模型适配器

文件：

```text
src/ai/providers/openai-compatible.ts
```

它负责和 OpenAI 兼容接口通信。

主要工作：

#### 转换消息

```ts
toOpenAIMessage(message)
```

把项目内部的：

```ts
{
  role: "user",
  content: "你好"
}
```

转换成 OpenAI 接口需要的格式。

#### 转换工具

```ts
toOpenAITool(tool)
```

把：

```ts
{
  name,
  description,
  parameters
}
```

转换成：

```ts
{
  type: "function",
  function: {
    name,
    description,
    parameters
  }
}
```

#### 发起请求

```ts
const response = await fetch(
  `${baseUrl}/chat/completions`,
  requestInit,
);
```

#### 解析模型流

模型可能返回：

```text
data: {"choices":[{"delta":{"content":"你"}}]}

data: {"choices":[{"delta":{"content":"好"}}]}

data: [DONE]
```

Provider 将其转换成项目统一的事件：

```ts
{
  type: "text_delta",
  delta: "你"
}
```

它通过这个函数创建 `streamFn`：

```ts
const streamFn =
  createOpenAICompatibleStreamFn({
    apiKey,
    baseUrl,
  });
```

所以：

```text
openai-compatible.ts
= StreamFn 的具体实现
```

---

### 6. `ai/event-stream.ts`：事件传输管道

文件：

```text
src/ai/event-stream.ts
```

它实现：

```ts
SimpleAssistantMessageEventStream
```

Provider 往里面放事件：

```ts
stream.push({
  type: "text_delta",
  delta: "你好",
  partial,
});
```

Agent Loop 从里面读取：

```ts
for await (const event of stream) {
  // 处理事件
}
```

它解决的是：

> Provider 一边收到模型数据，Agent 一边实时处理数据。

内部可以理解为一个队列：

```text
Provider push(event)
        ↓
事件队列
        ↓
Agent for await 读取
```

`end()` 表示后面没有事件了：

```ts
stream.end();
```

---

# 一次完整调用示例

外部先创建 Provider：

```ts
const streamFn =
  createOpenAICompatibleStreamFn({
    apiKey,
    baseUrl,
  });
```

然后创建 Agent：

```ts
const agent =
  new Agent({
    initialState: {
      model,
      messages: [],
      tools: [weatherTool],
    },

    loopConfig,

    streamFn,
  });
```

用户提问：

```ts
await agent.prompt(
  "北京天气怎么样？",
);
```

内部流程：

```text
agent.ts
调用 prompt()
   ↓
agent-loop.ts
创建 currentContext
   ↓
agent-loop.ts
提取 providerTools
   ↓
agent-loop.ts
调用 streamFn()
   ↓
openai-compatible.ts
转换消息和工具格式
   ↓
fetch()
   ↓
大模型 API
   ↓
openai-compatible.ts
解析 SSE 数据
   ↓
event-stream.ts
stream.push(event)
   ↓
agent-loop.ts
for await 读取事件
   ↓
agent.ts
通知外部监听器
```

## 最简单的记忆方式

```text
agent.ts
负责“对外使用 Agent”

agent-loop.ts
负责“Agent 怎么循环工作”

agent/types.ts
负责“Agent 内部有哪些类型”

ai/types.ts
负责“模型通信使用什么通用格式”

openai-compatible.ts
负责“怎么连接具体模型 API”

event-stream.ts
负责“模型事件怎么实时传递”
```

当前项目中，文本流已经能按这套链路运行；工具定义也能从 `Agent` 传到 Provider。模型返回的工具调用数据解析还需要继续完善。


`streamFn` 和 `event-stream.ts` 的关系是：

> `streamFn` 负责创建并返回事件流，`event-stream.ts` 负责实现这个事件流。

可以理解成：

```text
streamFn
  = 生产者函数

event-stream
  = 消息管道
```

## 1. `streamFn` 是什么？

`streamFn` 是一个函数：

```ts
const streamFn =
  createOpenAICompatibleStreamFn({
    apiKey,
    baseUrl,
  });
```

调用它：

```ts
const stream =
  await streamFn(
    model,
    context,
    options,
  );
```

它的工作是：

1. 请求大模型；
2. 创建一个事件流；
3. 把模型响应不断放进事件流；
4. 返回这个事件流。

---

## 2. `event-stream.ts` 是什么？

`event-stream.ts` 提供事件流对象：

```ts
const stream =
  createAssistantMessageEventStream();
```

这个对象支持：

```ts
stream.push(event);
stream.end();
```

也支持被读取：

```ts
for await (const event of stream) {
  // 读取事件
}
```

---

## 3. 两者在 Provider 中如何配合？

在 `openai-compatible.ts` 中大致是：

```ts
export function createOpenAICompatibleStreamFn(
  config,
): StreamFn {
  return (
    model,
    context,
    options,
  ) => {
    const stream =
      createAssistantMessageEventStream();

    void (async () => {
      const response =
        await fetch(...);

      stream.push({
        type: "start",
        partial: message,
      });

      stream.push({
        type: "text_delta",
        delta: "你好",
        partial: message,
      });

      stream.push({
        type: "done",
        reason: "stop",
        message,
      });

      stream.end();
    })();

    return stream;
  };
}
```

这里：

```ts
streamFn
```

是外层函数。

```ts
stream
```

是它创建出来并返回的事件流对象。

关系是：

```text
streamFn()
   ↓ 创建
event-stream
   ↓ push()
模型事件
   ↓ for await
Agent Loop
```

---

## 4. Agent Loop 如何读取？

```ts
const response =
  await streamFn(
    model,
    context,
    options,
  );

for await (const event of response) {
  // response 就是 event-stream
  // 这里逐个收到 start、text_delta、done
}
```

所以这两句的含义是：

```ts
const response = await streamFn(...);
```

调用 Provider，拿到事件流。

```ts
for await (const event of response) {
  ...
}
```

持续读取 Provider 放入事件流的事件。

---

## 一句话总结

```text
streamFn = 负责调用模型并生产事件的函数
event-stream = 用来承载这些事件的异步管道
```

它们不是同一个东西：

```text
streamFn() → 返回 event-stream
```




项目中 TypeBox 主要用于：

1. 定义工具参数规则；
2. 自动推导 TypeScript 类型；
3. 检查模型返回的工具参数；
4. 把参数规则发送给大模型。

## 1. 在 `ai/types.ts` 中定义工具结构

文件：

[src/ai/types.ts](F:/学习资料/大模型/agent-harness/src/ai/types.ts)

工具参数被定义为 TypeBox Schema：

```ts
export type Tool<
  TParameters extends Type.TSchema =
    Type.TSchema,
> = {
  name: string;
  description: string;
  parameters: TParameters;
};
```

这里的 `parameters` 不是普通对象，而是 TypeBox Schema。

---

## 2. 创建一个工具

例如天气工具：

```ts
import Type from "typebox";

const weatherParameters =
  Type.Object({
    city: Type.String(),
  });

const weatherTool = {
  name: "get_weather",

  description: "查询城市天气",

  parameters:
    weatherParameters,

  execute: async (_toolCallId, args) => {
    return {
      content: [
        {
          type: "text",
          text: `${args.city} 今天晴天`,
        },
      ],
    };
  },
};
```

这句：

```ts
Type.Object({
  city: Type.String(),
})
```

定义了规则：

```text
参数必须是对象
必须有 city
city 必须是字符串
```

---

## 3. 自动生成 TypeScript 类型

在 `agent/types.ts` 中：

```ts
parameters:
  Type.Static<TParameters>
```

例如：

```ts
const schema =
  Type.Object({
    city: Type.String(),
  });
```

那么：

```ts
Type.Static<typeof schema>
```

自动得到：

```ts
{
  city: string;
}
```

所以工具执行器中的 `args` 会被推导成：

```ts
{
  city: string;
}
```

这属于 TypeScript 编译阶段的类型检查。

---

## 4. Agent Loop 运行时校验

文件：

[src/agent/agent-loop.ts](F:/学习资料/大模型/agent-harness/src/agent/agent-loop.ts)

模型可能返回：

```json
{
  "city": "北京"
}
```

Agent Loop 会拿工具中的 Schema 编译出校验器：

```ts
const validator =
  Schema.Compile(tool.parameters);
```

然后检查模型传来的参数：

```ts
if (
  !validator.Check(
    toolCall.arguments,
  )
) {
  throw new Error(
    `Invalid arguments for tool: ${toolCall.name}`,
  );
}
```

例如：

```ts
{
  city: "北京"
}
```

校验结果：

```ts
true
```

但：

```ts
{
  city: 123
}
```

校验结果：

```ts
false
```

这一步是运行时检查，因为模型返回的数据本质上是不可信的。

---

## 5. Provider 把 Schema 发给模型

Agent Loop 会提取：

```ts
const providerTools =
  currentContext.tools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
```

然后 Provider 把 `parameters` 放进请求：

```ts
{
  type: "function",

  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}
```

最终模型看到：

```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "查询城市天气",
    "parameters": {
      "type": "object",
      "properties": {
        "city": {
          "type": "string"
        }
      },
      "required": ["city"]
    }
  }
}
```

模型根据这个规则生成工具参数。

---

## 完整流程

```text
Type.Object()
    ↓
定义工具参数 Schema
    ↓
传给 Provider
    ↓
转换成 JSON Schema
    ↓
发送给大模型
    ↓
模型生成 tool call 参数
    ↓
Schema.Compile()
    ↓
validator.Check()
    ↓
参数合法后执行 execute()
```

一句话：

> TypeBox 在你的项目中同时承担“工具参数定义、TypeScript 类型推导、模型参数描述和运行时参数校验”这四个作用。





是 **Agent Runtime 里的工具执行逻辑**调用 `execute()`，不是模型，也不是 Provider。

大致代码链是：

```ts
// Agent Loop 收到模型返回的 ToolCall 后
const tool = currentContext.tools?.find(
  (tool) => tool.name === toolCall.name,
);

// 找到后，由 Runtime 调用工具实现
const result = await tool.execute(
  toolCall.id,
  toolCall.arguments,
  signal,
);
```

也就是说：

1. 你把 `readFileTool` 放进 `Agent` 的 `tools`。
2. 模型返回 `read_file` 和参数。
3. Agent Loop 根据工具名找到对应对象。
4. Agent Loop 调用它的 `execute()`。
5. `execute()` 里的 `readFile(...)` 才真正读文件。

可以把模型理解成“提出请求的人”，Agent Runtime 是“调度员”，工具的 `execute()` 是“实际干活的函数”。



[Symbol.asyncIterator]是什么，为什么是个列表不是传统的函数名？







9:59






它不是列表，而是 JavaScript 内置的一个特殊 Symbol，用来标记“这个对象支持异步迭代”。
[Symbol.asyncIterator]() {
  return {
    next: async () => ({ value: "一条事件", done: false }),
  };
}
方括号表示“用括号里的值作为属性名”。普通属性名是字符串，比如 next；这里的属性名是 Symbol.asyncIterator。可以把它理解成 JavaScript 约定好的接口名。
for await 会按这个约定找方法并调用：
for await (const event of stream) {
  // ...
}
大致相当于：
const iterator = stream[Symbol.asyncIterator]();

while (true) {
  const result = await iterator.next();

  if (result.done) break;
  const event = result.value;
}
所以项目里的 [Symbol.asyncIterator]() 是为了让 stream 能被 for await ... of 使用。next() 每次交出一个事件；暂时没有事件时，它会等待后续的 push()。

[Symbol.asyncIterator 是什么







10:00






Symbol.asyncIterator 是 JavaScript 自带的一个特殊属性名，意思是：“这个对象提供了异步迭代功能。”
方括号不是数组，而是表示用这个特殊属性名定义方法：
const stream = {
  [Symbol.asyncIterator]() {
    // 返回一个能逐个提供数据的迭代器
  },
};
for await (const item of stream) 会自动调用这个方法，之后反复向它要下一项。
可以把它看成 JavaScript 规定的接口名：对象实现了它，就能被 for await...of 遍历。


src/trace/trace-collector.ts
import type {
  AssistantMessage,
  Model,
} from "../ai/types.js";

import type {
  ModelCallTrace,
  RunTrace,
  ToolCallTrace,
  TraceEvent,
} from "./types.js";


export type TraceCollector = {
  readonly trace: RunTrace;

  startTurn(
    turnIndex: number,
  ): void;

  endTurn(
    turnIndex: number,
  ): void;

  startModelCall(input: {
    callId: string;
    turnIndex: number;
    model: Model;
    inputMessageCount: number;
  }): void;

  endModelCall(input: {
    callId: string;
    stopReason:
      AssistantMessage["stopReason"];
    errorMessage?: string;
  }): void;

  startToolCall(input: {
    toolCallId: string;
    turnIndex: number;
    toolName: string;
    args: unknown;
  }): void;

  endToolCall(input: {
    toolCallId: string;
    isError: boolean;
    errorMessage?: string;
  }): void;

  finish(
    status:
      | "completed"
      | "error"
      | "aborted",
  ): void;
};


export function createTraceCollector(
  runId: string,
): TraceCollector {
  const startedAt =
    Date.now();


  const trace: RunTrace = {
    runId,

    status:
      "running",

    startedAt,

    modelCalls: [],

    toolCalls: [],

    events: [
      {
        type:
          "run_start",

        timestamp:
          startedAt,
      },
    ],
  };


  function record(
    event: TraceEvent,
  ): void {
    trace.events.push(
      event,
    );
  }


  return {
    trace,


    startTurn(
      turnIndex,
    ) {
      record({
        type:
          "turn_start",

        turnIndex,

        timestamp:
          Date.now(),
      });
    },


    endTurn(
      turnIndex,
    ) {
      record({
        type:
          "turn_end",

        turnIndex,

        timestamp:
          Date.now(),
      });
    },


    startModelCall(input) {
      const startedAt =
        Date.now();


      const modelCall:
        ModelCallTrace = {
        callId:
          input.callId,

        turnIndex:
          input.turnIndex,

        model: {
          id:
            input.model.id,

          provider:
            input.model.provider,
        },

        startedAt,

        inputMessageCount:
          input.inputMessageCount,
      };


      trace.modelCalls.push(
        modelCall,
      );


      record({
        type:
          "model_call_start",

        callId:
          input.callId,

        turnIndex:
          input.turnIndex,

        timestamp:
          startedAt,
      });
    },


    endModelCall(input) {
      const modelCall =
        trace.modelCalls.find(
          (candidate) =>
            candidate.callId
            === input.callId,
        );


      if (!modelCall) {
        throw new Error(
          `Unknown model call: ${input.callId}`,
        );
      }


      const endedAt =
        Date.now();


      modelCall.endedAt =
        endedAt;

      modelCall.stopReason =
        input.stopReason;


      if (
        input.errorMessage
        !== undefined
      ) {
        modelCall.errorMessage =
          input.errorMessage;
      }


      record({
        type:
          "model_call_end",

        callId:
          input.callId,

        turnIndex:
          modelCall.turnIndex,

        stopReason:
          input.stopReason,

        timestamp:
          endedAt,
      });
    },


    startToolCall(input) {
      const startedAt =
        Date.now();


      const toolCall:
        ToolCallTrace = {
        toolCallId:
          input.toolCallId,

        turnIndex:
          input.turnIndex,

        toolName:
          input.toolName,

        args:
          input.args,

        startedAt,
      };


      trace.toolCalls.push(
        toolCall,
      );


      record({
        type:
          "tool_call_start",

        toolCallId:
          input.toolCallId,

        turnIndex:
          input.turnIndex,

        toolName:
          input.toolName,

        args:
          input.args,

        timestamp:
          startedAt,
      });
    },


    endToolCall(input) {
      const toolCall =
        trace.toolCalls.find(
          (candidate) =>
            candidate.toolCallId
            === input.toolCallId,
        );


      if (!toolCall) {
        throw new Error(
          `Unknown tool call: ${input.toolCallId}`,
        );
      }


      const endedAt =
        Date.now();


      toolCall.endedAt =
        endedAt;

      toolCall.isError =
        input.isError;


      if (
        input.errorMessage
        !== undefined
      ) {
        toolCall.errorMessage =
          input.errorMessage;
      }


      record({
        type:
          "tool_call_end",

        toolCallId:
          input.toolCallId,

        turnIndex:
          toolCall.turnIndex,

        toolName:
          toolCall.toolName,

        isError:
          input.isError,

        timestamp:
          endedAt,
      });
    },


    finish(status) {
      /*
       * 避免同一个 Run 被结束两次。
       */
      if (
        trace.status
        !== "running"
      ) {
        return;
      }


      const endedAt =
        Date.now();


      trace.status =
        status;

      trace.endedAt =
        endedAt;


      record({
        type:
          "run_end",

        status,

        timestamp:
          endedAt,
      });
    },
  };
}
2. 现在理解它在干什么

例如未来 Agent 开始执行：

const trace =
  createTraceCollector(
    "run-001",
  );

模型调用：

trace.startModelCall({
  callId: "model-1",
  turnIndex: 0,
  model,
  inputMessageCount: 1,
});

结束：

trace.endModelCall({
  callId: "model-1",
  stopReason: "toolUse",
});

工具：

trace.startToolCall({
  toolCallId: "call-123",
  turnIndex: 0,
  toolName: "read_file",
  args: {
    path: "package.json",
  },
});

结束：

trace.endToolCall({
  toolCallId: "call-123",
  isError: false,
});

最终：

trace.finish(
  "completed",
);

于是你同时得到：

trace.trace.events

时间线，以及：

trace.trace.modelCalls
trace.trace.toolCalls

结构化汇总。

3. 为什么 TraceCollector 不直接订阅 AgentEvent

现在先不要写成：

AgentEvent
→ TraceCollector

因为有一些 Trace 信息当前 AgentEvent 根本没有，比如：

model call id
inputMessageCount
具体哪次 Model Call 属于哪个 Turn

而后面 ExtensionHost 出现后，我们才会决定：

Agent Loop hooks
↓
AgentEvent
↓
Trace

最终怎样统一。

现在先让 Collector 自己保持简单。

4. 一个设计点：为什么结束时要查找对应 Call

比如：

trace.modelCalls.find(...)

因为生命周期天然是：

start
↓
中间发生很多事情
↓
end

所以 Collector 需要维护同一个逻辑对象：

startModelCall
创建记录

endModelCall
补 endedAt / stopReason

这也是以后：

duration =
endedAt - startedAt

的基础。

5. 现在只验证类型

运行：

pnpm build

如果通过就行。


可以。TypeScript 里的 `class` 有两种身份：

```ts
class SimpleAssistantMessageEventStream {
  push() {}
}
```

它既是一个**可以创建对象的类**，也是描述这些对象形状的**类型**。

所以这里：

```ts
function createAssistantMessageEventStream():
  SimpleAssistantMessageEventStream {
  return new SimpleAssistantMessageEventStream();
}
```

意思是：

> 函数返回一个 `SimpleAssistantMessageEventStream` 类创建出来的对象。

`new` 创建对象；冒号后面写这个对象的类型。

可以类比：

```ts
class Cat {}

function createCat(): Cat {
  return new Cat();
}
```

如果要表示“返回这个类本身”，才写：

```ts
function getCatClass(): typeof Cat {
  return Cat;
}
```

因此，`SimpleAssistantMessageEventStream` 在当前代码里是**返回对象的类型**，不是“类本身”。


本项目的 **Hook + Extension 机制，本质上是给 Agent Loop 安装可插拔的控制器**。

Agent Loop 负责正常工作，Hook 定义可以介入的时机，Extension 实现具体功能，ExtensionHost 负责组织并执行这些功能。

## 一、先理解四个核心组件

| 组件 | 文件 | 作用 |
|---|---|---|
| Hook | `agent/hooks.ts` | 定义生命周期中的介入时机 |
| Extension | `agent/extension.ts` | 实现某些 Hook 的具体功能 |
| ExtensionHost | `agent/extension-host.ts` | 注册、管理并依次调用 Extension |
| Agent Loop | `agent/agent-loop.ts` | 主动触发生命周期 Hook |

它们之间的关系是：

```text
                 Agent Loop
                     │
              触发生命周期
                     ↓
                    Hook
                     │
                     ↓
               ExtensionHost
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
        Budget    Approval    Logger
```

注意：Hook 是接口定义，不是独立运行的程序。实际调用发生在 Agent Loop 中。:chatgpt-content-reference{index="0"}

## 二、Hook 在什么时候执行？

你的项目定义了以下生命周期 Hook：

| Hook | 触发时间 | 典型用途 |
|---|---|---|
| `onTurnStart` | 每轮开始 | 初始化本轮记录 |
| `beforeModelCall` | 调用模型之前 | 检查模型调用预算 |
| `afterModelCall` | 模型返回之后 | 记录 Token Usage |
| `beforeToolCall` | 执行工具之前 | 预算检查、人工审批 |
| `afterToolCall` | 工具执行之后 | 记录成功或失败 |
| `onTurnEnd` | 每轮结束 | 完成本轮统计 |
| `onRunEnd` | 整个任务结束 | 汇总任务状态 |

这些 Hook 不需要模型主动调用，是 Agent Loop 在执行过程中自动触发的。

例如：

```text
用户：运行 pnpm test
        │
        ▼
    onTurnStart
        │
        ▼
  beforeModelCall
        │
        ▼
    DeepSeek
        │
        ▼
  afterModelCall
        │
        ▼
模型要求 run_command
        │
        ▼
  beforeToolCall
        │
        ▼
     执行工具
        │
        ▼
   afterToolCall
        │
        ▼
     onTurnEnd
        │
        ▼
工具结果进入 Context
        │
        ▼
     下一轮模型调用
```

如果模型已经给出最终回答，就结束循环，最后触发 `onRunEnd`。

## 三、Extension 是怎样注册的？

看你项目里的 CLI：

```ts
extensions: [
  createBudgetExtension({
    maxModelCalls: 30,
    maxToolCalls: 50,
  }),

  createCommandApprovalExtension({
    approve: askInTerminal,
  }),

  createLoggerExtension(),
],
```

这实际上创建了三个 Extension 对象，然后把它们交给 Agent Loop。:chatgpt-content-reference{index="1"}

每个 Extension 都有相同的基本结构：

```ts
type AgentExtension = {
  name: string;
  hooks: AgentLoopHooks;
};
```

但不要求实现所有 Hook。

例如，Budget 只需要关心：

```ts
{
  name: "budget",

  hooks: {
    beforeModelCall() {
      // 检查模型调用次数
    },

    beforeToolCall() {
      // 检查工具调用次数
    },
  },
}
```

Logger 则可以实现多个 Hook，在任务执行期间持续打印日志。

因此，添加新功能通常不需要修改 Agent Loop，只需要创建新的 Extension 并注册。

## 四、ExtensionHost 如何运行它们？

这是整个架构的关键。

假设模型准备调用：

```ts
run_command("pnpm test");
```

Agent Loop 会先执行：

```ts
const blocked =
  await extensionHost.beforeToolCall({
    turnIndex,
    toolCall,
  });
```

而 ExtensionHost 内部的逻辑可以简化为：

```ts
async function beforeToolCall(input) {
  for (const extension of extensions) {
    const result =
      await extension.hooks.beforeToolCall?.(input);

    if (result?.block === true) {
      return result;
    }
  }

  return undefined;
}
```

这意味着三个 Extension **按照注册顺序执行**，而不是并行执行。

你的项目就是：

```text
beforeToolCall
      │
      ▼
    Budget
      │
      ▼
Command Approval
      │
      ▼
    Logger
      │
      ▼
   真正执行工具
```

只要某个 Extension 返回 `{ block: true, reason }`，ExtensionHost 就立即停止后续检查。Agent Loop 不执行这个工具，而是把拒绝原因转换成错误 ToolResult，交还模型。:chatgpt-content-reference{index="2"} :chatgpt-content-reference{index="3"}

## 五、结合你的真实运行理解

你之前运行：

```powershell
agent-harness "运行 node --version 告诉我版本"
```

执行过程是：

```text
1. DeepSeek 产生 ToolCall
   run_command("node --version")

2. Budget 检查
   没有超限，放行

3. Command Approval 检查
   不属于白名单

4. 终端询问
   允许吗？[y/N]

5. 你输入 n
   返回 block=true

6. ExtensionHost 立即结束检查

7. run_command 不执行

8. 生成错误 ToolResult

9. DeepSeek 根据拒绝结果重新回答
```

所以你看到：

```text
执行过的工具：[]
```

并不是模型没有申请调用工具，而是**模型申请了，但工具执行前被 Hook 拦截了**。

另外，被阻止的调用不会触发 `afterToolCall`；由于当前 Logger 注册在审批 Extension 后面，它也不会收到此次调用的 `beforeToolCall`。这是注册顺序直接产生的效果。:chatgpt-content-reference{index="4"}

还有一个值得注意的细节：目前 Budget 注册在 Approval 前面。如果 Budget 在 `beforeToolCall` 放行时立即增加计数，那么随后被人工拒绝的命令也会消耗一次工具预算。以后若希望预算只统计实际执行的工具，需要调整这一机制。

## 六、Hook 和 Event 有什么区别？

你的项目还有：

```ts
agent.subscribe((event) => {
  // ...
});
```

它和 Hook 不完全相同。

**Hook 是执行流程中的介入点。** 它可以异步等待、检查条件，必要时阻止操作。

**Event 是发生事情之后发出的通知。** 外部订阅者可以据此更新界面、输出日志或收集统计，但现有订阅接口不承担工具执行前的拦截职责。

例如：

```text
beforeToolCall Hook
    ↓
审批通过
    ↓
tool_execution_start Event
    ↓
真正执行工具
    ↓
tool_execution_end Event
    ↓
afterToolCall Hook
```

两者不能完全替代。

**最终记住：Agent Loop 控制主流程，Hook 提供介入时机，Extension 实现附加能力，ExtensionHost 负责依次调度。**

这套设计的价值是以后加入 Context 管理、Trace 或其他功能时，可以优先考虑利用生命周期扩展，而不用不断往 Agent Loop 里增加专门的判断逻辑。



对，**C1 本质上就是“估算当前 Context 大小”**，不是精确 tokenizer 计数。

而且这不是你这个项目特有的做法，**很多 Agent/Context 管理系统都会采用“真实 usage + 本地估算”的混合方式**。

Pi 就是这样：先找最近一条带有效 `usage` 的 assistant 消息，把 Provider 已经返回的真实 token 数作为基准；再对这之后新增、尚未经过下一次模型调用的消息做本地估算。[GitHub](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/compaction/compaction.ts?utm_source=chatgpt.com)

可以理解成：

```text
上一次模型调用
Provider 已经告诉我：当时 Context ≈ 20,000 token
                ↓
之后又新增：
ToolResult
Assistant ToolCall
ToolResult
                ↓
这些还没有新的真实 usage
                ↓
只能自己估算，比如 + 1,500
                ↓
当前 Context ≈ 21,500
```

### 为什么不全部精确算？

因为你有两个时间点。

**调用模型之后**，Provider 能告诉你真实 usage：

```text
input = 20300
output = 180
```

这时候不需要猜。

但 Agent 执行工具以后：

```text
模型调用
↓
tool call
↓
读取一个 500 行文件
↓
ToolResult 加入 Context
↓
准备下一次模型调用
```

在“准备下一次调用”的这个瞬间，Provider 还没见过新的 ToolResult，自然也还没有新的真实 `input_tokens`。

可 Agent 必须**在调用模型之前**判断：

```text
现在是不是快爆 Context Window 了？
要不要先 Compaction？
```

所以必须估算新增部分。

---

### 为什么不直接在本地用 tokenizer 精确计算？

理论上可以，但现实中比较麻烦：

不同模型 tokenizer 不一样，而且 Provider 还可能有额外的消息模板、工具 schema、thinking、缓存处理等开销。

比如：

```text
DeepSeek tokenizer
GPT tokenizer
Claude tokenizer
Qwen tokenizer
```

未必完全一样。

而且真正发送的是：

```text
system prompt
messages
tool schemas
role markers
JSON serialization
provider-specific template
```

你本地即使把“文本”精确 tokenize，也不一定和服务端最终计算完全一致。

所以很多实现会选择：

> **已有真实 usage 就信 Provider；没有真实 usage 的新增部分，用近似公式。**

Pi 当前公开实现就是这个思路，并且其本地估算仍然是简单的字符启发式。[GitHub](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/compaction/compaction.ts?utm_source=chatgpt.com)

---

### 我们为什么还单独做 C1？

因为我们不是单纯为了显示一个数字，而是后面要靠它决定：

```text
要不要 Compaction
```

假设：

```text
contextWindow = 128k
reserve = 16k
```

那么：

```text
当前估算 > 112k
→ 先不要继续请求模型
→ 先压缩
```

所以 C1 实际上是 C3 的“传感器”。

可以类比：

```text
C1 = 油量表
C2 = 决定扔掉哪些行李
C3 = 真正整理行李
C4 = 上路测试
```

没有 C1，C3 就不知道什么时候该启动。

---

### 其他 Agent 一定都这样吗？

不一定完全相同，公开实现大致有几类：

| 做法 | 思路 |
|---|---|
| Provider usage + 本地估算 | Pi 这一类 |
| 本地 tokenizer 计数 | 已知固定模型/tokenizer 时可做 |
| 字符/经验公式估算 | 简单、快、跨 Provider |
| 根本不主动算 | 等 Provider 报 context overflow 再处理 |
| Provider 自带 context management | 把部分压缩/清理交给服务端 |

所以 **“Context 要估算”很常见，但具体怎么算没有统一标准。**

你现在这套更像：

```text
真实 usage 做锚点
+
只估新增内容
```

比从头到尾全部 `字符数 ÷ 4` 更靠谱。

另外你们还针对中文做了：

```text
ASCII ≈ chars / 4
中文等非 ASCII ≈ 1 char / token
```

这属于针对你真实任务分布做的工程修正，后面再用 DeepSeek 的真实 `input` 校准即可。

一句话：

> **C1 不是为了精确算 token，而是为了在下一次模型调用之前，足够可靠地判断“Context 快满了吗”。**