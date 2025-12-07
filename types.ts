// ... existing code ...

export interface TaskChatMessage {
  id: string;
  taskId: string;
  senderId: string;
  messageText: string;
  isRead: boolean;
  createdAt: string;
  attachments?: string[];
}

// ... existing code ...
