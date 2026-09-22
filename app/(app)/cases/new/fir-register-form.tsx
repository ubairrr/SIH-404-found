"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { registerFir, type CreateCaseState } from "@/app/actions/cases";
import {
  registerFirSchema,
  type RegisterFirInput,
} from "@/app/lib/validation/case";

const INPUT_CLASSES =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500";

export function FirRegisterForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    CreateCaseState,
    FormData
  >(registerFir, undefined);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFirInput>({
    resolver: zodResolver(registerFirSchema),
    defaultValues: {
      firNumber: "",
      title: "",
      offenceSections: "",
      policeStation: "",
      complainant: "",
      accused: "",
      description: "",
    },
  });

  useEffect(() => {
    if (state?.success) {
      router.push("/dashboard");
      return;
    }
    if (state?.fieldErrors) {
      for (const [field, message] of Object.entries(state.fieldErrors)) {
        if (message) {
          setError(field as keyof RegisterFirInput, { message });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const showBanner = state?.error && !state.fieldErrors;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) => {
        const formData = new FormData();
        formData.set("firNumber", values.firNumber);
        formData.set("title", values.title);
        formData.set("offenceSections", values.offenceSections);
        formData.set("incidentDate", String(values.incidentDate));
        formData.set("policeStation", values.policeStation);
        formData.set("complainant", values.complainant);
        formData.set("accused", values.accused);
        formData.set("description", values.description);
        startTransition(() => {
          formAction(formData);
        });
      })}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="firNumber"
            className="text-sm font-semibold text-slate-700"
          >
            FIR number
          </label>
          <input
            id="firNumber"
            type="text"
            placeholder="KOT/2026/0142"
            className={INPUT_CLASSES}
            {...register("firNumber")}
          />
          {errors.firNumber && (
            <p className="text-sm text-red-700">{errors.firNumber.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="incidentDate"
            className="text-sm font-semibold text-slate-700"
          >
            Incident date
          </label>
          <input
            id="incidentDate"
            type="date"
            className={INPUT_CLASSES}
            {...register("incidentDate")}
          />
          {errors.incidentDate && (
            <p className="text-sm text-red-700">
              {errors.incidentDate.message}
            </p>
          )}
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          <label
            htmlFor="title"
            className="text-sm font-semibold text-slate-700"
          >
            Title
          </label>
          <input
            id="title"
            type="text"
            className={INPUT_CLASSES}
            {...register("title")}
          />
          {errors.title && (
            <p className="text-sm text-red-700">{errors.title.message}</p>
          )}
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          <label
            htmlFor="offenceSections"
            className="text-sm font-semibold text-slate-700"
          >
            Offence / sections
          </label>
          <input
            id="offenceSections"
            type="text"
            placeholder="BNS Section 305(a), BNS Section 351(2)"
            className={INPUT_CLASSES}
            {...register("offenceSections")}
          />
          {errors.offenceSections && (
            <p className="text-sm text-red-700">
              {errors.offenceSections.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="policeStation"
            className="text-sm font-semibold text-slate-700"
          >
            Police station
          </label>
          <input
            id="policeStation"
            type="text"
            className={INPUT_CLASSES}
            {...register("policeStation")}
          />
          {errors.policeStation && (
            <p className="text-sm text-red-700">
              {errors.policeStation.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="complainant"
            className="text-sm font-semibold text-slate-700"
          >
            Complainant
          </label>
          <input
            id="complainant"
            type="text"
            className={INPUT_CLASSES}
            {...register("complainant")}
          />
          {errors.complainant && (
            <p className="text-sm text-red-700">
              {errors.complainant.message}
            </p>
          )}
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          <label
            htmlFor="accused"
            className="text-sm font-semibold text-slate-700"
          >
            Accused
          </label>
          <input
            id="accused"
            type="text"
            className={INPUT_CLASSES}
            {...register("accused")}
          />
          {errors.accused && (
            <p className="text-sm text-red-700">{errors.accused.message}</p>
          )}
        </div>

        <div className="col-span-2 flex flex-col gap-1">
          <label
            htmlFor="description"
            className="text-sm font-semibold text-slate-700"
          >
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            className={INPUT_CLASSES}
            {...register("description")}
          />
          {errors.description && (
            <p className="text-sm text-red-700">
              {errors.description.message}
            </p>
          )}
        </div>
      </div>

      {showBanner && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-700 px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-60"
        >
          {pending ? "Registering…" : "Register FIR"}
        </button>
      </div>
    </form>
  );
}
