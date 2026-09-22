"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import type { Case } from "@prisma/client";

import { updateCaseDetails, type UpdateCaseState } from "@/app/actions/cases";
import { updateCaseSchema } from "@/app/lib/validation/case";

// z.input (not z.infer) — the pre-coercion shape, matching the
// RegisterFirInput decision in Plan 02-01 (incidentDate uses
// z.coerce.date(), which diverges the schema's client/server types).
type EditCaseFormInput = z.input<typeof updateCaseSchema>;

const INPUT_CLASSES =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500";
const BUTTON_CLASSES =
  "rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-60";
const CANCEL_CLASSES =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// D-12 platform-wide view/Edit rule: defaults to a read-only <dl>, matching
// the E4 metadata-grid pattern, plus a top-right Edit button. Pressing Edit
// swaps in the existing form markup with Save/Cancel. Cancel returns to view
// mode without calling updateCaseDetails and without resetting react-hook-
// form's field values (acceptable per D-12 — no explicit "discard on
// cancel" requirement beyond returning to the read-only view). A successful
// save also resets mode to "view".
export function EditCaseForm({ kase }: { kase: Case }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [state, formAction, pending] = useActionState<
    UpdateCaseState,
    FormData
  >(updateCaseDetails, undefined);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EditCaseFormInput>({
    resolver: zodResolver(updateCaseSchema),
    defaultValues: {
      caseId: kase.id,
      title: kase.title,
      offenceSections: kase.offenceSections,
      policeStation: kase.policeStation,
      complainant: kase.complainant,
      accused: kase.accused,
      description: kase.description,
    },
  });

  useEffect(() => {
    if (state?.fieldErrors) {
      for (const [field, message] of Object.entries(state.fieldErrors)) {
        if (message) {
          setError(field as keyof EditCaseFormInput, { message });
        }
      }
    }
    if (state?.success) {
      startTransition(() => {
        setMode("view");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const showBanner = state?.error && !state.fieldErrors;

  if (mode === "view") {
    return (
      <div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={CANCEL_CLASSES}
          >
            Edit
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase text-slate-500">Title</dt>
            <dd className="break-words text-sm text-slate-900">
              {kase.title || "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase text-slate-500">
              Offence / Sections
            </dt>
            <dd className="break-words text-sm text-slate-900">
              {kase.offenceSections || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">
              Incident Date
            </dt>
            <dd className="break-words text-sm text-slate-900">
              {formatDate(kase.incidentDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">
              Police Station
            </dt>
            <dd className="break-words text-sm text-slate-900">
              {kase.policeStation || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Complainant</dt>
            <dd className="break-words text-sm text-slate-900">
              {kase.complainant || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Accused</dt>
            <dd className="break-words text-sm text-slate-900">
              {kase.accused || "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase text-slate-500">Description</dt>
            <dd className="break-words text-sm text-slate-900">
              {kase.description || "—"}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) => {
        const formData = new FormData();
        formData.set("caseId", kase.id);
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
      <input type="hidden" {...register("caseId")} />

      <div className="grid grid-cols-2 gap-4">
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
            htmlFor="incidentDate"
            className="text-sm font-semibold text-slate-700"
          >
            Incident date
          </label>
          <input
            id="incidentDate"
            type="date"
            defaultValue={toDateInputValue(kase.incidentDate)}
            className={INPUT_CLASSES}
            {...register("incidentDate")}
          />
          {errors.incidentDate && (
            <p className="text-sm text-red-700">
              {errors.incidentDate.message}
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

        <div className="flex flex-col gap-1">
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

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={BUTTON_CLASSES}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => setMode("view")}
          disabled={pending}
          className={CANCEL_CLASSES}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
