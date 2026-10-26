export type FormState = { ok: boolean; message: string | null };
export const initialFormState: FormState = { ok: false, message: null };
export const fail = (message: string): FormState => ({ ok: false, message });
export const done = (message: string): FormState => ({ ok: true, message });
