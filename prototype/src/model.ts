export type TaskId = "claim" | "browser";
export type PageId = "form" | "receipt" | "policy" | "brief" | "comparison";
export type Lifecycle = "Active" | "Later" | "Settled";
export interface Task {
  id: TaskId;
  title: string;
  lifecycle: Lifecycle;
  pages: PageId[];
  selectedPage: PageId;
  history: PageId[];
  historyIndex: number;
  note: string;
  recap: string;
  assistant: "ready" | "stopped" | "off";
}
export const initialTasks: Task[] = [
  {
    id: "claim",
    title: "Submit travel claim",
    lifecycle: "Active",
    pages: ["form", "receipt", "policy"],
    selectedPage: "form",
    history: ["form"],
    historyIndex: 0,
    note: "Receipt attached. Check the amount, then submit.",
    recap: "",
    assistant: "ready",
  },
  {
    id: "browser",
    title: "Choose a team browser",
    lifecycle: "Active",
    pages: ["brief", "comparison"],
    selectedPage: "brief",
    history: ["brief"],
    historyIndex: 0,
    note: "Compare how each option handles returning to unfinished work.",
    recap: "",
    assistant: "ready",
  },
];
export const pages: Record<PageId, { title: string; address: string }> = {
  form: { title: "Expense form", address: "expenses.example.com/claims/new" },
  receipt: {
    title: "Train receipt.pdf",
    address: "expenses.example.com/receipts/train-receipt.pdf",
  },
  policy: {
    title: "Travel policy",
    address: "handbook.example.com/travel-policy",
  },
  brief: {
    title: "Team requirements",
    address: "team.example.com/browser-requirements",
  },
  comparison: {
    title: "Browser comparison",
    address: "team.example.com/browser-comparison",
  },
};
export interface PageReport {
  knowledge: "known" | "unknown";
  dirty: boolean;
  pending: boolean;
  canSettle: boolean;
  label: string;
}

export function visitPage(task: Task, page: PageId): Task {
  if (!task.pages.includes(page) || task.selectedPage === page) return task;
  const history = [...task.history.slice(0, task.historyIndex + 1), page];
  return {
    ...task,
    selectedPage: page,
    history,
    historyIndex: history.length - 1,
  };
}
