"use client";

import { useActionState, useRef, useTransition, type FormEvent } from "react";
import { initialFormState, type FormState } from "@/lib/form-state";

/**
 * Like useActionState, but submits via onSubmit so React 19 does not reset the form afterwards:
 * a validation error must not wipe what the user typed. Pass `resetOnSuccess` for add-item forms.
 */
export function useFormAction<S extends FormState>(
  action: (prev: S, form: FormData) => Promise<S>,
  { resetOnSuccess = false }: { resetOnSuccess?: boolean } = {},
) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [state, dispatch, pending] = useActionState<S, FormData>(async (prev: Awaited<S>, form: FormData) => {
    const next = await action(prev as S, form);
    if (resetOnSuccess && next.ok) formRef.current?.reset();
    return next;
  }, initialFormState as Awaited<S>);
  const [, startTransition] = useTransition();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    formRef.current = e.currentTarget;
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
  return [state, onSubmit, pending] as const;
}
