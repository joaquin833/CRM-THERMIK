"use client";

import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  setHours,
  setMinutes,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import type { AgendaTask, TaskType } from "@/lib/agenda";

export type CalendarView = "month" | "week" | "day";

type Props = {
  tasks: AgendaTask[];
  view: CalendarView;
  onTaskOpen: (task: AgendaTask) => void;
  onCreateAt: (date: Date) => void;
};

const typeStyles: Record<TaskType, string> = {
  follow_up: "border-emerald-300 bg-emerald-100 text-emerald-900",
  call: "border-blue-300 bg-blue-100 text-blue-900",
  meeting: "border-violet-300 bg-violet-100 text-violet-900",
  email: "border-cyan-300 bg-cyan-100 text-cyan-900",
  visit: "border-teal-300 bg-teal-100 text-teal-900",
  quote_review: "border-amber-300 bg-amber-100 text-amber-900",
  other: "border-slate-300 bg-slate-100 text-slate-800",
};

const typeLabels: Record<TaskType, string> = {
  follow_up: "Seguimiento",
  call: "Llamada",
  meeting: "Reunión",
  email: "Correo",
  visit: "Visita",
  quote_review: "Revisión de cotización",
  other: "Otro",
};

export default function AgendaCalendar({
  tasks,
  view,
  onTaskOpen,
  onCreateAt,
}: Props) {
  const [cursor, setCursor] = useState(() => new Date());

  const title = useMemo(() => {
    if (view === "month") return format(cursor, "MMMM yyyy", { locale: es });
    if (view === "day") return format(cursor, "EEEE d 'de' MMMM", { locale: es });
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    const end = endOfWeek(cursor, { weekStartsOn: 1 });
    return `${format(start, "d MMM", { locale: es })} - ${format(end, "d MMM yyyy", { locale: es })}`;
  }, [cursor, view]);

  function previous() {
    setCursor((current) =>
      view === "month" ? subMonths(current, 1) : view === "week" ? subWeeks(current, 1) : addDays(current, -1),
    );
  }

  function next() {
    setCursor((current) =>
      view === "month" ? addMonths(current, 1) : view === "week" ? addWeeks(current, 1) : addDays(current, 1),
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCursor(new Date())} className="focus-ring rounded-lg border px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Hoy</button>
          <button type="button" onClick={previous} className="focus-ring rounded-lg border p-1.5 text-slate-600 hover:bg-slate-50" aria-label="Período anterior"><ChevronLeft className="size-4" /></button>
          <button type="button" onClick={next} className="focus-ring rounded-lg border p-1.5 text-slate-600 hover:bg-slate-50" aria-label="Período siguiente"><ChevronRight className="size-4" /></button>
          <h2 className="ml-1 text-base font-bold capitalize text-slate-950">{title}</h2>
        </div>
      </div>

      {view === "month" ? (
        <MonthView cursor={cursor} tasks={tasks} onTaskOpen={onTaskOpen} onCreateAt={onCreateAt} />
      ) : (
        <TimeGrid cursor={cursor} tasks={tasks} days={view === "week" ? 7 : 1} onTaskOpen={onTaskOpen} onCreateAt={onCreateAt} />
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {(Object.keys(typeLabels) as TaskType[]).map((type) => (
          <span key={type} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full border ${typeStyles[type]}`} />{typeLabels[type]}</span>
        ))}
      </div>
    </section>
  );
}

function MonthView({ cursor, tasks, onTaskOpen, onCreateAt }: { cursor: Date; tasks: AgendaTask[]; onTaskOpen: (task: AgendaTask) => void; onCreateAt: (date: Date) => void }) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <div key={day} className="px-2 py-2">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayTasks = tasksForDay(tasks, day);
            return (
              <div key={day.toISOString()} className={`min-h-24 border-b border-r p-1.5 ${isSameMonth(day, cursor) ? "bg-white" : "bg-slate-50/70"}`}>
                <div className="flex items-center justify-between">
                  <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${isToday(day) ? "bg-emerald-800 text-white" : isSameMonth(day, cursor) ? "text-slate-700" : "text-slate-400"}`}>{format(day, "d")}</span>
                  <button type="button" onClick={() => onCreateAt(setMinutes(setHours(day, 9), 0))} className="rounded p-1 text-slate-300 hover:bg-emerald-50 hover:text-emerald-700" aria-label={`Crear actividad el ${format(day, "d MMMM", { locale: es })}`}><Plus className="size-3.5" /></button>
                </div>
                <div className="mt-1 grid gap-0.5">
                  {dayTasks.slice(0, 4).map((task) => <EventChip key={task.id} task={task} onOpen={onTaskOpen} />)}
                  {dayTasks.length > 4 && <span className="px-1 text-[11px] font-semibold text-slate-500">+{dayTasks.length - 4} más</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimeGrid({ cursor, tasks, days, onTaskOpen, onCreateAt }: { cursor: Date; tasks: AgendaTask[]; days: number; onTaskOpen: (task: AgendaTask) => void; onCreateAt: (date: Date) => void }) {
  const first = days === 7 ? startOfWeek(cursor, { weekStartsOn: 1 }) : startOfDay(cursor);
  const dates = Array.from({ length: days }, (_, index) => addDays(first, index));
  const hours = Array.from({ length: 12 }, (_, index) => index + 8);

  return (
    <div className="overflow-x-auto">
      <div className={days === 7 ? "min-w-[900px]" : "min-w-[620px]"}>
        <div className="grid border-b bg-slate-50" style={{ gridTemplateColumns: `72px repeat(${days}, minmax(0, 1fr))` }}>
          <div />
          {dates.map((date) => <div key={date.toISOString()} className="border-l px-2 py-2 text-center"><p className="text-xs font-semibold uppercase text-slate-500">{format(date, "EEE", { locale: es })}</p><p className={`mx-auto mt-1 grid size-8 place-items-center rounded-full text-sm font-bold ${isToday(date) ? "bg-emerald-800 text-white" : "text-slate-800"}`}>{format(date, "d")}</p></div>)}
        </div>
        {hours.map((hour) => (
          <div key={hour} className="grid" style={{ gridTemplateColumns: `72px repeat(${days}, minmax(0, 1fr))` }}>
            <div className="border-b px-2 py-2 text-right text-xs text-slate-400">{String(hour).padStart(2, "0")}:00</div>
            {dates.map((date) => {
              const slot = setMinutes(setHours(date, hour), 0);
              const slotTasks = tasksForHour(tasks, slot);
              return (
                <div
                  key={slot.toISOString()}
                  role="button"
                  tabIndex={0}
                  onClick={() => onCreateAt(slot)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onCreateAt(slot);
                    }
                  }}
                  className="min-h-12 cursor-pointer border-b border-l p-1 text-left outline-none hover:bg-emerald-50/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                  aria-label={`Crear actividad el ${format(slot, "d 'de' MMMM 'a las' HH:mm", { locale: es })}`}
                >
                  {slotTasks.map((task) => (
                    <EventChip key={task.id} task={task} onOpen={onTaskOpen} compact />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventChip({ task, onOpen, compact = false }: { task: AgendaTask; onOpen: (task: AgendaTask) => void; compact?: boolean }) {
  const late = task.is_overdue ?? (!["completed", "cancelled"].includes(task.status) && new Date(task.due_at).getTime() < Date.now());
  const style = late ? "border-red-300 bg-red-100 text-red-900" : task.status === "completed" ? "border-slate-300 bg-slate-100 text-slate-500" : typeStyles[task.task_type];
  return (
    <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(task); }} className={`block w-full truncate rounded-md border px-1.5 py-1 text-left text-[11px] font-semibold ${style}`} title={task.title}>
      {!task.all_day && <span className="mr-1 font-normal">{format(new Date(task.start_at || task.due_at), "HH:mm")}</span>}{task.title}{!compact && late ? " · Vencida" : ""}
    </button>
  );
}

function tasksForDay(tasks: AgendaTask[], day: Date) {
  return tasks.filter((task) => isSameDay(new Date(task.start_at || task.due_at), day)).sort(byDate);
}

function tasksForHour(tasks: AgendaTask[], slot: Date) {
  return tasks.filter((task) => {
    const date = new Date(task.start_at || task.due_at);
    return isSameDay(date, slot) && date.getHours() === slot.getHours();
  }).sort(byDate);
}

function byDate(a: AgendaTask, b: AgendaTask) {
  return new Date(a.start_at || a.due_at).getTime() - new Date(b.start_at || b.due_at).getTime();
}
