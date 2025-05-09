---
title: Настройка работы WebSocket с Effector
lang: ru
description: Подробное руководство по созданию надёжного и масштабируемого WebSocket-клиента с использованием Effector.
---

# Работа с WebSocket в Effector (#websocket-integration)

В этом руководстве мы рассмотрим как правильно организовать работу с WebSocket соединением используя Effector.

:::info{title="WebSocket и типы данных"}
WebSocket API поддерживает передачу данных в виде строк или бинарных данных (`Blob`/`ArrayBuffer`). В этом руководстве мы сфокусируемся на работе со строками, так как это наиболее распространённый случай при обмене данными. При необходимости работы с бинарными данными, можно адаптировать примеры под нужный формат.
:::

## Базовая модель (#basic-model)

Создадим простую, но рабочую модель WebSocket клиента. Для начала определим основные события и состояния:

```ts
import { createStore, createEvent, createEffect, sample } from "effector";

// События для работы с сокетом
const disconnected = createEvent();
const messageSent = createEvent<string>();
const rawMessageReceived = createEvent<string>();

const $connection = createStore<WebSocket | null>(null)
  .on(connectWebSocketFx.doneData, (_, ws) => ws)
  .reset(disconnected);
```

Создадим эффект для установки соединения:

```ts
const connectWebSocketFx = createEffect((url: string): Promise<WebSocket> => {
  const ws = new WebSocket(url);

  const scopeDisconnected = scopeBind(disconnected);
  const scopeRawMessageReceived = scopeBind(rawMessageReceived);

  return new Promise((res, rej) => {
    ws.onopen = () => {
      res(ws);
    };

    ws.onmessage = (event) => {
      scopeRawMessageReceived(event.data);
    };

    ws.onclose = () => {
      scopeDisconnected();
    };

    ws.onerror = (err) => {
      scopeDisconnected();
      rej(err);
    };
  });
});
```

Обратите внимание, что мы использовали здесь функцию [`scopeBind`](/ru/api/effector/scopeBind), чтобы связать юниты с текущим скоупом выполнения, так как мы не знаем когда вызовется `scopeMessageReceived` внутри `socket.onmessage`. Иначе событие попадет в глобальный скоуп.
[Читать более подробно](/ru/advanced/work-with-scope).

:::warning{title="Работа в режиме 'без скоупа'"}
Если вы по какой-то причине работаете в режиме без скоупа, то вам не нужно использовать `scopeBind`.<br/>
Учитывайте, что [работа со скоупом это рекомундуемый вариант работы](/ru/guides/best-practices#use-scope)!
:::

## Обработка сообщений (#message-handling)

Создадим стор для последнего полученного сообщения:

```ts
const $lastMessage = createStore("");

$lastMessage.on(messageReceived, (_, newMessage) => newMessage);
```

А также реализуем эффект для отправки сообщения:

```ts
const sendMessageFx = createEffect((params: { socket: WebSocket; message: string }) => {
  params.socket.send(params.message);
});

// Связываем отправку сообщения с текущим сокетом
sample({
  clock: messageSent,
  source: $connection,
  filter: Boolean, // Отправляем только если есть соединение
  fn: (socket, message) => ({
    socket,
    message,
  }),
  target: sendMessageFx,
});
```

:::tip{title="Состояния соединения"}
WebSocket имеет несколько состояний подключения (`CONNECTING`, `OPEN`, `CLOSING`, `CLOSED`). В базовой модели мы упрощаем это до простой проверки через `Boolean`, но в реальном приложении может потребоваться более детальное отслеживание состояния.
:::

## Обработка ошибок (#error-handling)

При работе с WebSocket важно корректно обрабатывать различные типы ошибок для обеспечения надежности приложения.

Расширим нашу базовую модель добавив обработку ошибок:

```ts
const TIMEOUT = 5_000;

// Добавляем события для ошибок
const socketError = createEvent<Error>();

const connectWebSocketFx = createEffect((url: string): Promise<WebSocket> => {
  const ws = new WebSocket(url);

  const scopeDisconnected = scopeBind(disconnected);
  const scopeRawMessageReceived = scopeBind(rawMessageReceived);
  const scopeSocketError = scopeBind(socketError);

  return new Promise((res, rej) => {
    const timeout = setTimeout(() => {
      const error = new Error("Connection timeout");

      socketError(error);
      reject(error);
      socket.close();
    }, TIMEOUT);

    ws.onopen = () => {
      clearTimeout(timeout);
      res(ws);
    };

    ws.onmessage = (event) => {
      scopeMessageReceived(event.data);
    };

    ws.onclose = () => {
      disconnected();
    };

    ws.onerror = (err) => {
      const error = new Error("WebSocket error");
      scopeDisconnected();
      scopeSocketError(error);
      rej(err);
    };
  });
});

// Стор для хранения ошибки
const $error = createStore("")
  .on(socketError, (_, error) => error.message)
  .reset(connectWebSocketFx.done);
```

:::warning{title="Обработка ошибок"}
Всегда обрабатывайте ошибки WebSocket соединения, так как они могут возникнуть по множеству причин: проблемы с сетью, таймауты, невалидные данные и т.д.
:::

## Типизация сообщений (#typed-socket-message)

При работе с WebSocket важно обеспечить типобезопасность данных. Это позволяет предотвратить ошибки на этапе разработки и повысить надёжность приложения при обработке различных типов сообщений.

Для этого воспользуемся библиотекой [Zod](https://zod.dev/), хотя можно использовать любую другую библиотеку для валидации.

:::info{title="TypeScript и проверка типов"}
Даже если вы не используете Zod или другую библиотеку валидации, базовую типизацию WebSocket сообщений можно реализовать и с помощью обычных TypeScript-интерфейсов. Но помните — они проверяют типы только на этапе компиляции и не защитят вас от неожиданных данных во время выполнения.
:::

Предположим, что мы ожидаем два типа сообщений: `balanceChanged` и `reportGenerated`, содержащие следующие поля:

```ts
export const messagesSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("balanceChanged"),
    balance: z.number(),
  }),
  z.object({
    type: z.literal("reportGenerated"),
    reportId: z.string(),
    reportName: z.string(),
  }),
]);

// Получаем тип из схемы
type MessagesSchema = z.infer<typeof messagesSchema>;
```

Теперь добавим эффект обработки сообщений, чтобы гарантировать, что они соответствуют ожидаемым типам, а также логику получения сообщений:

```ts
const parsedMessageReceived = createEvent<MessagesSchema>();

const parseFx = createEffect((message: unknown): MessagesSchema => {
  return messagesSchema.parse(JSON.parse(typeof message === "string" ? message : "{}"));
});

// Парсим сообщение при его получении
sample({
  clock: rawMessageReceived,
  target: parseFx,
});

// Если парсинг удался — отправляем сообщение дальше
sample({
  clock: parseFx.doneData,
  target: parsedMessageReceived,
});
```

Мы также должны обработать ситуацию, когда сообщение не соответствует схеме:

```ts
const validationError = createEvent<Error>();

// Если парсинг не удался — обрабатываем ошибку
sample({
  clock: parseFx.failData,
  target: validationError,
});
```

Вот и всё, теперь все входящие сообщения будут проверяться на соответствие схеме перед их обработкой, а также иметь типизацию.

:::tip{title="Типизация отправляемых сообщений"}
Такой же подход можно применить и для исходящих сообщений. Это позволит проверять их структуру перед отправкой и избежать ошибок.
:::

Если хочется более точечного контроля, можно сделать событие, которое будет срабатывать только для определенного типа сообщений:

```ts
type MessageType<T extends MessagesSchema["type"]> = Extract<MessagesSchema, { type: T }>;

export const messageReceivedByType = <T extends MessagesSchema["type"]>(type: T) => {
  return sample({
    clock: parsedMessageReceived,
    filter: (message): message is MessageType<T> => {
      return message.type === type;
    },
  });
};
```

Пример использования:

```ts
sample({
  clock: messageReceivedByType("balanceChanged"),
  fn: (message) => {
    // Typescript знает структуру message
  },
  target: doWhateverYouWant,
});
```

:::info{title="Возвращаемые значения sample"}
Если вы не уверены, какие данные возвращает sample, рекомендуем ознакомиться с документацией по [`sample`](/ru/essentials/unit-composition).
:::

## Работа с `Socket.IO` (#socket-io)

[Socket.IO](https://socket.io/) предоставляет более высокоуровневый API для работы с WebSocket, добавляя множество полезных возможностей "из коробки".

:::info{title="Преимущества Socket.IO"}

- Автоматическое переподключение
- Поддержка комнат и пространств имён
- Fallback на HTTP Long-polling если WebSocket недоступен
- Встроенная поддержка событий и подтверждений (acknowledgments)
- Автоматическая сериализация/десериализация данных

:::

```ts
import { io, Socket } from "socket.io-client";
import { createStore, createEvent, createEffect, sample } from "effector";

const API_URL = "wss://your.ws.server";

// События
const connected = createEvent();
const disconnected = createEvent();
const socketError = createEvent<Error>();

// Типизация для событий
type ChatMessage = {
  room: string;
  message: string;
  author: string;
};

const messageSent = createEvent<ChatMessage>();
const messageReceived = createEvent<ChatMessage>();
const socketConnected = createEvent();
const connectSocket = createEvent();

const connectFx = createEffect((): Promise<Socket> => {
  const socket = io(API_URL, {
    //... ваша конфигурация
  });

  // нужно для корректной работы со скоупами
  const scopeConnected = scopeBind(connected);
  const scopeDisconnected = scopeBind(disconnected);
  const scopeSocketError = scopeBind(socketError);
  const scopeMessageReceived = scopeBind(messageReceived);

  return new Promise((resolve, reject) => {
    socket.on("connect", () => {
      scopeConnected();
      resolve(socket);
    });

    socket.on("disconnect", () => scopeDisconnected());
    socket.on("connect_error", (error) => scopeSocketError(error));
    socket.on("chat message", (msg: ChatMessage) => scopeMessageReceived(msg));
  });
});

const sendMessageFx = createEffect(
  ({
    socket,
    name,
    payload,
  }: SocketResponse<any> & {
    socket: Socket;
  }) => {
    socket.emit(name, payload);
  },
);

// Состояния
const $socket = createStore<Socket | null>(null)
  .on(connectFx.doneData, (_, socket) => socket)
  .reset(disconnected);

// инициализация подключения
sample({
  clock: connectSocket,
  target: connectFx,
});

// вызываем событие после успешного подключения
sample({
  clock: connectSocketFx.doneData,
  target: socketConnected,
});
```
