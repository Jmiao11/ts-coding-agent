import type {
  AssistantMessageEvent,
  AssistantMessageEventStream,
} from "./types.js";


export class SimpleAssistantMessageEventStream
  implements AssistantMessageEventStream
{
  private readonly queue:
    AssistantMessageEvent[] = [];

  private readonly waiters: Array<
    (
      result:
        IteratorResult<AssistantMessageEvent>,
    ) => void
  > = [];

  private ended = false;


  push(event: AssistantMessageEvent): void {
    if (this.ended) {
      throw new Error(
        "Cannot push to an ended stream.",
      );
    }

    const waiter = this.waiters.shift();

    if (waiter) {
      waiter({
        value: event,
        done: false,
      });

      return;
    }

    this.queue.push(event);
  }


  end(): void {
    if (this.ended) {
      return;
    }

    this.ended = true;

    for (const waiter of this.waiters) {
      waiter({
        value: undefined,
        done: true,
      });
    }

    this.waiters.length = 0;
  }


  [Symbol.asyncIterator]():
    AsyncIterator<AssistantMessageEvent> {
    return {
      next: () => {
        const event = this.queue.shift();

        if (event) {
          return Promise.resolve({
            value: event,
            done: false,
          });
        }

        if (this.ended) {
          return Promise.resolve({
            value: undefined,
            done: true,
          });
        }

        return new Promise<
          IteratorResult<AssistantMessageEvent>
        >((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}


// 消息传送管道，模型不断产生消息
//       ↓
// stream.push()
//       ↓
// Agent 不断读取消息

export function createAssistantMessageEventStream():
  SimpleAssistantMessageEventStream {
  return new SimpleAssistantMessageEventStream();
}
// AssistantMessageEventStream 是一个基于异步迭代协议的助手消息事件流接口。