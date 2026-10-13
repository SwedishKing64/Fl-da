"use client";

import { useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";

/**
 * A form that submits to a server action without letting React reset the fields afterwards.
 * React 19 clears an uncontrolled <form action={fn}> once the action finishes, which wipes
 * what the user typed when the action returns a validation error. Calling the action
 * ourselves (inside a transition) keeps the fields; pass `resetOnSuccess` with the action
 * state to clear them after a successful save.
 */
export function ActionForm({
  action,
  state,
  resetOnSuccess = false,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  state?: { ok: boolean } | null;
  resetOnSuccess?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [, start] = useTransition();
  const lastOk = useRef<{ ok: boolean } | null | undefined>(state);

  useEffect(() => {
    if (resetOnSuccess && state && state.ok && state !== lastOk.current) ref.current?.reset();
    lastOk.current = state;
  }, [state, resetOnSuccess]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(() => {
      void action(data);
    });
  };

  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      {children}
    </form>
  );
}
