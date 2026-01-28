// 1) Create this file: src/components/ui.tsx

import React from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold " +
  "transition-all duration-150 select-none " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary:
    "bg-black text-white shadow-sm hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 active:shadow-sm",
  secondary:
    "bg-white text-black border border-black/10 shadow-sm hover:shadow-md hover:-translate-y-[1px] active:translate-y-0",
  danger:
    "bg-red-600 text-white shadow-sm hover:shadow-md hover:-translate-y-[1px] active:translate-y-0",
  ghost:
    "bg-transparent text-black hover:bg-black/5 active:bg-black/10",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({
  title,
  children,
  right,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid gap-2">
      <div className="text-sm font-medium text-black/80">{label}</div>
      {children}
      {hint ? <div className="text-xs text-black/60">{hint}</div> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm " +
        "shadow-sm outline-none transition " +
        "focus:border-black/30 focus:ring-2 focus:ring-black/20 " +
        "disabled:bg-black/5 disabled:cursor-not-allowed " +
        (props.className ?? "")
      }
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm " +
        "shadow-sm outline-none transition " +
        "focus:border-black/30 focus:ring-2 focus:ring-black/20 " +
        "disabled:bg-black/5 disabled:cursor-not-allowed " +
        (props.className ?? "")
      }
    />
  );
}

export function Notice({ text }: { text: string }) {
  return (
    <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-black/10 bg-black/5 p-4 text-sm text-black/80">
      {text}
    </pre>
  );
}
