"use client";

import { startTransition, useActionState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { login, type LoginState } from "@/app/actions/auth";
import { loginSchema, type LoginInput } from "@/app/lib/validation/auth";
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
} from "@/app/lib/demo-accounts";
import { ROLE_BADGE_CLASSES, ROLE_LABELS } from "@/app/lib/role-display";

export function LoginForm({ demoMode }: { demoMode: boolean }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    undefined,
  );

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  return (
    <form
      className="flex w-full flex-col gap-4"
      onSubmit={handleSubmit((values) => {
        const formData = new FormData();
        formData.set("username", values.username);
        formData.set("password", values.password);
        startTransition(() => {
          formAction(formData);
        });
      })}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-sm font-medium text-slate-700">
          Username
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
          {...register("username")}
        />
        {errors.username && (
          <p className="text-sm text-amber-600">{errors.username.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-amber-600">{errors.password.message}</p>
        )}
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-blue-700 px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      {demoMode && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Demo accounts
          </p>
          <ul className="flex flex-col gap-1">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.username}>
                <button
                  type="button"
                  onClick={() => {
                    setValue("username", account.username);
                    setValue("password", DEMO_PASSWORD);
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-left text-sm text-slate-700 transition hover:border-blue-500 hover:text-slate-900"
                >
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${ROLE_BADGE_CLASSES[account.role]}`}
                  >
                    {ROLE_LABELS[account.role]}
                  </span>{" "}
                  <span className="text-slate-500">
                    — {account.username}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
