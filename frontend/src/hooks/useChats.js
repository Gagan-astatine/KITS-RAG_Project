import { useCallback, useEffect, useRef, useState } from "react";

const BASE_CHATS_KEY = "kb_chats_v1";
const BASE_ACTIVE_CHAT_KEY = "kb_active_chat";
const MAX_CHATS = 30;

function getStorageKeys(userId) {
  const scope = userId ? `user_${userId}` : "guest";
  return {
    chatsKey: `${BASE_CHATS_KEY}_${scope}`,
    activeChatKey: `${BASE_ACTIVE_CHAT_KEY}_${scope}`,
  };
}

function createId() {
  return crypto.randomUUID();
}

function createChat() {
  const now = Date.now();
  return {
    id: createId(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function normalizeMessage(message) {
  if (!message || typeof message !== "object") return null;
  const {
    chartImage: legacyChartImage,
    chartData: legacyChartData,
    ...rest
  } = message;
  return {
    ...rest,
    chart_image: message.chart_image ?? legacyChartImage,
    chart_data: message.chart_data ?? legacyChartData,
    id: typeof message.id === "string" ? message.id : createId(),
    timestamp:
      typeof message.timestamp === "number" ? message.timestamp : Date.now(),
  };
}

function normalizeChat(chat) {
  if (!chat || typeof chat !== "object" || !Array.isArray(chat.messages)) {
    return null;
  }
  const now = Date.now();
  return {
    id: typeof chat.id === "string" ? chat.id : createId(),
    title: typeof chat.title === "string" ? chat.title : "New chat",
    createdAt: typeof chat.createdAt === "number" ? chat.createdAt : now,
    updatedAt: typeof chat.updatedAt === "number" ? chat.updatedAt : now,
    messages: chat.messages.map(normalizeMessage).filter(Boolean),
  };
}

function readInitialState(userId) {
  const { chatsKey, activeChatKey } = getStorageKeys(userId);
  try {
    const storedChats = JSON.parse(localStorage.getItem(chatsKey) || "[]");
    const chats = Array.isArray(storedChats)
      ? storedChats.map(normalizeChat).filter(Boolean)
      : [];
    const storedActiveId = localStorage.getItem(activeChatKey);
    const activeChatId = chats.some((chat) => chat.id === storedActiveId)
      ? storedActiveId
      : chats[0]?.id;
    if (chats.length > 0) return { chats, activeChatId };
  } catch (error) {
    console.warn("Could not restore saved chats.", error);
  }

  const chat = createChat();
  return { chats: [chat], activeChatId: chat.id };
}

function sortedNewestFirst(chats) {
  return [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
}

function persistChats(chats, activeChatId, userId) {
  const { chatsKey, activeChatKey } = getStorageKeys(userId);
  let candidates = sortedNewestFirst(chats)
    .slice(0, MAX_CHATS)
    .map((chat) => ({
      ...chat,
      messages: chat.messages.map((message) => ({ ...message })),
    }));
  let nextActiveId = candidates.some((chat) => chat.id === activeChatId)
    ? activeChatId
    : candidates[0]?.id;
  let changed =
    candidates.length !== chats.length || nextActiveId !== activeChatId;

  while (candidates.length > 0) {
    try {
      localStorage.setItem(chatsKey, JSON.stringify(candidates));
      if (nextActiveId) {
        localStorage.setItem(activeChatKey, nextActiveId);
      } else {
        localStorage.removeItem(activeChatKey);
      }
      return { chats: candidates, activeChatId: nextActiveId, changed };
    } catch (error) {
      let oldestImage;
      for (const chat of [...candidates].sort(
        (a, b) => a.createdAt - b.createdAt,
      )) {
        const messages = [...chat.messages].sort(
          (a, b) => a.timestamp - b.timestamp,
        );
        const message = messages.find((item) => item.chart_image);
        if (message) {
          oldestImage = { chat, message };
          break;
        }
      }

      if (oldestImage) {
        oldestImage.message.chart_image = null;
        changed = true;
        continue;
      }

      if (candidates.length > 1) {
        const oldest = [...candidates].sort(
          (a, b) => a.createdAt - b.createdAt,
        )[0];
        candidates = candidates.filter((chat) => chat.id !== oldest.id);
        changed = true;
        if (nextActiveId === oldest.id) nextActiveId = candidates[0]?.id;
        continue;
      }

      console.error("Could not save chat history to localStorage.", error);
      return { chats: candidates, activeChatId: nextActiveId, changed: false };
    }
  }

  const replacement = createChat();
  return { chats: [replacement], activeChatId: replacement.id, changed: true };
}

function titleFromFirstQuestion(messages) {
  const firstQuestion = messages.find((message) => message.role === "user");
  if (!firstQuestion) return null;
  const title = firstQuestion.text.trim();
  return title.length > 32 ? `${title.slice(0, 31).trimEnd()}…` : title;
}

export default function useChats(userId) {
  const [chats, setChats] = useState(() => readInitialState(userId).chats);
  const [activeChatId, setActiveChatId] = useState(() => readInitialState(userId).activeChatId);
  const chatsRef = useRef(chats);
  const activeChatIdRef = useRef(activeChatId);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const commit = useCallback((nextChats, nextActiveId = activeChatIdRef.current) => {
    const persisted = persistChats(nextChats, nextActiveId, userIdRef.current);
    chatsRef.current = persisted.chats;
    activeChatIdRef.current = persisted.activeChatId;
    setChats(persisted.chats);
    setActiveChatId(persisted.activeChatId);
  }, []);

  // When authenticated user changes (sign in or sign out), reload isolated chat state
  useEffect(() => {
    const state = readInitialState(userId);
    chatsRef.current = state.chats;
    activeChatIdRef.current = state.activeChatId;
    setChats(state.chats);
    setActiveChatId(state.activeChatId);
  }, [userId]);

  const updateMessages = useCallback(
    (chatId, update) => {
      const nextChats = chatsRef.current.map((chat) => {
        if (chat.id !== chatId) return chat;
        const messages =
          typeof update === "function" ? update(chat.messages) : update;
        const title = chat.title === "New chat" ? titleFromFirstQuestion(messages) : null;
        return {
          ...chat,
          ...(title ? { title } : {}),
          updatedAt: Date.now(),
          messages,
        };
      });
      commit(nextChats);
    },
    [commit],
  );

  const selectChat = useCallback(
    (chatId) => {
      if (!chatsRef.current.some((chat) => chat.id === chatId)) return;
      commit(chatsRef.current, chatId);
    },
    [commit],
  );

  const startNewChat = useCallback(() => {
    const current = chatsRef.current.find(
      (chat) => chat.id === activeChatIdRef.current,
    );
    if (current?.messages.length === 0) return current.id;
    const chat = createChat();
    commit([chat, ...chatsRef.current], chat.id);
    return chat.id;
  }, [commit]);

  const deleteChat = useCallback(
    (chatId) => {
      const remaining = chatsRef.current.filter((chat) => chat.id !== chatId);
      if (remaining.length === 0) {
        const replacement = createChat();
        commit([replacement], replacement.id);
        return;
      }
      const nextActiveId =
        activeChatIdRef.current === chatId
          ? sortedNewestFirst(remaining)[0].id
          : activeChatIdRef.current;
      commit(remaining, nextActiveId);
    },
    [commit],
  );

  const clearAllChats = useCallback(() => {
    const chat = createChat();
    commit([chat], chat.id);
  }, [commit]);

  const activeChat = chats.find((chat) => chat.id === activeChatId) || null;

  return {
    chats,
    activeChat,
    activeChatId,
    clearAllChats,
    deleteChat,
    selectChat,
    startNewChat,
    updateMessages,
  };
}
