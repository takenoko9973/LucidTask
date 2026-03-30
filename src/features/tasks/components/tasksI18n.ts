import enMessagesJson from "../../../shared/i18n/tasks/en.json";
import jaMessagesJson from "../../../shared/i18n/tasks/ja.json";

export type TasksLocale = "ja" | "en";

export const DEFAULT_TASKS_LOCALE: TasksLocale = "ja";
export const TASKS_LOCALE_STORAGE_KEY = "lucid-task.locale";
export const SUPPORTED_TASKS_LOCALES: readonly TasksLocale[] = ["ja", "en"];

export interface TaskWidgetMessages {
  eyebrow: string;
  addTask: string;
  noActiveTitle: string;
  taskSingular: string;
  taskPlural: string;
  emptyMessage: string;
  loading: string;
  showMore: string;
  showLess: string;
}

export interface TaskIndicatorMessages {
  completed: string;
  overdueOrToday: string;
  daily: string;
  futureDeadline: string;
}

export interface TaskDeadlineMessages {
  overdue: string;
  days: (count: number) => string;
  hours: (count: number) => string;
  minutes: (count: number) => string;
}

export interface TaskCardMessages {
  completeAria: string;
  restoreAria: string;
  pinnedAria: string;
}

export interface TaskDialogMessages {
  modeCreate: string;
  modeEdit: string;
  titleLabel: string;
  typeLegend: string;
  typeDaily: string;
  typeDeadline: string;
  deadlineLabel: string;
  pinLabel: string;
  cancel: string;
  delete: string;
  deleteConfirm: string;
  save: string;
  saving: string;
  closeAria: string;
  taskIdRequired: string;
  requiredTitle: string;
  requiredDeadline: string;
  taskNotFound: (taskId: string) => string;
}

export interface TasksMessages {
  widget: TaskWidgetMessages;
  indicator: TaskIndicatorMessages;
  deadline: TaskDeadlineMessages;
  card: TaskCardMessages;
  dialog: TaskDialogMessages;
}

interface RawTaskDeadlineMessages {
  overdue: string;
  days: string;
  hours: string;
  minutes: string;
}

interface RawTaskDialogMessages extends Omit<TaskDialogMessages, "taskNotFound"> {
  taskNotFound: string;
}

interface RawTasksMessages {
  widget: TaskWidgetMessages;
  indicator: TaskIndicatorMessages;
  deadline: RawTaskDeadlineMessages;
  card: TaskCardMessages;
  dialog: RawTaskDialogMessages;
}

type RawTasksMessagesCatalog = Record<TasksLocale, RawTasksMessages>;

function formatTemplate(template: string, variables: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}

function resolvePlural(locale: TasksLocale, count: number): string {
  return locale === "en" && count !== 1 ? "s" : "";
}

function buildDurationFormatter(locale: TasksLocale, template: string): (count: number) => string {
  return (count) =>
    formatTemplate(template, {
      count,
      plural: resolvePlural(locale, count),
    });
}

function toTasksMessages(locale: TasksLocale, raw: RawTasksMessages): TasksMessages {
  return {
    widget: raw.widget,
    indicator: raw.indicator,
    deadline: {
      overdue: raw.deadline.overdue,
      days: buildDurationFormatter(locale, raw.deadline.days),
      hours: buildDurationFormatter(locale, raw.deadline.hours),
      minutes: buildDurationFormatter(locale, raw.deadline.minutes),
    },
    card: raw.card,
    dialog: {
      ...raw.dialog,
      taskNotFound: (taskId) => formatTemplate(raw.dialog.taskNotFound, { taskId }),
    },
  };
}

const RAW_TASKS_MESSAGES: RawTasksMessagesCatalog = {
  ja: jaMessagesJson as RawTasksMessages,
  en: enMessagesJson as RawTasksMessages,
};
const TASKS_MESSAGES: Record<TasksLocale, TasksMessages> = {
  ja: toTasksMessages("ja", RAW_TASKS_MESSAGES.ja),
  en: toTasksMessages("en", RAW_TASKS_MESSAGES.en),
};

export function getTasksMessages(locale: TasksLocale): TasksMessages {
  return TASKS_MESSAGES[locale];
}

export function normalizeTasksLocale(value: string | null | undefined): TasksLocale {
  if (isTasksLocale(value)) {
    return value;
  }
  return DEFAULT_TASKS_LOCALE;
}

export function isTasksLocale(value: string | null | undefined): value is TasksLocale {
  return value === "ja" || value === "en";
}

export function loadTasksLocale(): TasksLocale {
  if (typeof window === "undefined") {
    return DEFAULT_TASKS_LOCALE;
  }

  return normalizeTasksLocale(window.localStorage.getItem(TASKS_LOCALE_STORAGE_KEY));
}

export function saveTasksLocale(locale: TasksLocale): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TASKS_LOCALE_STORAGE_KEY, locale);
}
