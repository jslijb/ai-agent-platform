import { create } from "zustand";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  conversationId: string | null;
  loading: boolean;
  addMessage: (msg: ChatMessage) => void;
  updateLastAssistant: (content: string) => void;
  setConversationId: (id: string) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  conversationId: null,
  loading: false,
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  updateLastAssistant: (content) =>
    set((state) => {
      const msgs = [...state.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs[i] = { ...msgs[i], content };
          break;
        }
      }
      return { messages: msgs };
    }),
  setConversationId: (id) => set({ conversationId: id }),
  setLoading: (loading) => set({ loading }),
  clearMessages: () => set({ messages: [], conversationId: null }),
}));
