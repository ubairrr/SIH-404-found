"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Role } from "@prisma/client";

import {
  createUser,
  changeRole,
  resetPassword,
  deactivateUser,
  reactivateUser,
  type CreateUserState,
} from "@/app/actions/users";
import {
  createUserSchema,
  type CreateUserInput,
} from "@/app/lib/validation/user";
import { ROLE_BADGE_CLASSES, ROLE_LABELS } from "@/app/lib/role-display";

export type AdminUserRow = {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  designation: string | null;
  unit: string | null;
  badgeId: string | null;
  isActive: boolean;
};

const ROLE_OPTIONS: Role[] = [
  "POLICE",
  "FORENSICS",
  "PROSECUTION",
  "COURT",
  "ADMIN",
];

function Cell({ value }: { value: string | null | undefined }) {
  return (
    <span className="truncate" title={value ?? undefined}>
      {value && value.length > 0 ? value : "—"}
    </span>
  );
}

function CreateUserForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState<
    CreateUserState,
    FormData
  >(createUser, undefined);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      fullName: "",
      username: "",
      designation: "",
      unit: "",
      badgeId: "",
      initialPassword: "",
    },
  });

  useEffect(() => {
    if (state?.success) {
      reset();
      onSuccess();
      return;
    }
    if (state?.fieldErrors) {
      for (const [field, message] of Object.entries(state.fieldErrors)) {
        if (message) {
          setError(field as keyof CreateUserInput, { message });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const showBanner = state?.error && !state.fieldErrors;

  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-8 shadow-xl"
      onSubmit={handleSubmit((values) => {
        const formData = new FormData();
        formData.set("fullName", values.fullName);
        formData.set("username", values.username);
        formData.set("role", values.role);
        formData.set("designation", values.designation);
        formData.set("unit", values.unit);
        formData.set("badgeId", values.badgeId);
        formData.set("initialPassword", values.initialPassword);
        startTransition(() => {
          formAction(formData);
        });
      })}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="fullName"
            className="text-sm font-semibold text-slate-700"
          >
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
            {...register("fullName")}
          />
          {errors.fullName && (
            <p className="text-sm text-amber-600">
              {errors.fullName.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="username"
            className="text-sm font-semibold text-slate-700"
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="off"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
            {...register("username")}
          />
          {errors.username && (
            <p className="text-sm text-amber-600">
              {errors.username.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="role"
            className="text-sm font-semibold text-slate-700"
          >
            Role
          </label>
          <select
            id="role"
            defaultValue=""
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
            {...register("role")}
          >
            <option value="" disabled>
              Select role
            </option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          {errors.role && (
            <p className="text-sm text-amber-600">{errors.role.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="designation"
            className="text-sm font-semibold text-slate-700"
          >
            Designation
          </label>
          <input
            id="designation"
            type="text"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
            {...register("designation")}
          />
          {errors.designation && (
            <p className="text-sm text-amber-600">
              {errors.designation.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="unit"
            className="text-sm font-semibold text-slate-700"
          >
            Unit
          </label>
          <input
            id="unit"
            type="text"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
            {...register("unit")}
          />
          {errors.unit && (
            <p className="text-sm text-amber-600">{errors.unit.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="badgeId"
            className="text-sm font-semibold text-slate-700"
          >
            Badge ID
          </label>
          <input
            id="badgeId"
            type="text"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
            {...register("badgeId")}
          />
          {errors.badgeId && (
            <p className="text-sm text-amber-600">
              {errors.badgeId.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="initialPassword"
            className="text-sm font-semibold text-slate-700"
          >
            Initial password
          </label>
          <input
            id="initialPassword"
            type="text"
            autoComplete="off"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
            {...register("initialPassword")}
          />
          {errors.initialPassword && (
            <p className="text-sm text-amber-600">
              {errors.initialPassword.message}
            </p>
          )}
        </div>
      </div>

      {showBanner && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create user"}
        </button>
      </div>
    </form>
  );
}

function Dialog({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        {children}
      </div>
      {/* Click-outside-to-close overlay, kept behind the panel */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 -z-10 cursor-default"
      />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

function ChangeRoleDialog({
  user,
  onClose,
}: {
  user: AdminUserRow;
  onClose: () => void;
}) {
  const [newRole, setNewRole] = useState<Role | "">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!newRole) return;
    setPending(true);
    setError(null);
    try {
      const result = await changeRole(user.id, newRole);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog onClose={onClose}>
      <p className="break-words text-sm text-slate-700">
        Change <span className="font-semibold">{user.fullName}</span>&rsquo;s
        role from {ROLE_LABELS[user.role]} to{" "}
        {newRole ? ROLE_LABELS[newRole] : "…"}?
      </p>

      <select
        value={newRole}
        onChange={(e) => setNewRole(e.target.value as Role)}
        className="mt-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
      >
        <option value="" disabled>
          Select role
        </option>
        {ROLE_OPTIONS.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>

      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending || !newRole || newRole === user.role}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save role"}
        </button>
      </div>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: AdminUserRow;
  onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await resetPassword(user.id, newPassword);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog onClose={onClose}>
      <p className="break-words text-sm text-slate-700">
        Reset password for{" "}
        <span className="font-semibold">{user.fullName}</span>? They must use
        the new password on their next login.
      </p>

      <input
        type="text"
        autoComplete="off"
        placeholder="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="mt-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
      />

      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending || newPassword.length < 8}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Reset password"}
        </button>
      </div>
    </Dialog>
  );
}

function ToggleActiveDialog({
  user,
  onClose,
}: {
  user: AdminUserRow;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDeactivating = user.isActive;

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      const result = isDeactivating
        ? await deactivateUser(user.id)
        : await reactivateUser(user.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog onClose={onClose}>
      <p className="break-words text-sm text-slate-700">
        {isDeactivating ? (
          <>
            Deactivate <span className="font-semibold">{user.fullName}</span>?
            They will be signed out on their next request and cannot log in
            until reactivated.
          </>
        ) : (
          <>
            Reactivate <span className="font-semibold">{user.fullName}</span>?
            They will be able to log in again immediately.
          </>
        )}
      </p>

      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className={
            isDeactivating
              ? "rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
              : "rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
          }
        >
          {pending
            ? isDeactivating
              ? "Deactivating…"
              : "Reactivating…"
            : isDeactivating
              ? "Deactivate account"
              : "Reactivate account"}
        </button>
      </div>
    </Dialog>
  );
}

function RowActions({
  user,
  disableLifecycleControls,
}: {
  user: AdminUserRow;
  disableLifecycleControls: boolean;
}) {
  const [openDialog, setOpenDialog] = useState<
    "role" | "reset" | "toggle" | null
  >(null);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disableLifecycleControls}
        onClick={() => setOpenDialog("role")}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Change role
      </button>
      <button
        type="button"
        onClick={() => setOpenDialog("reset")}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-100"
      >
        Reset password
      </button>
      <button
        type="button"
        disabled={disableLifecycleControls}
        onClick={() => setOpenDialog("toggle")}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {user.isActive ? "Deactivate user" : "Reactivate user"}
      </button>

      {openDialog === "role" && (
        <ChangeRoleDialog user={user} onClose={() => setOpenDialog(null)} />
      )}
      {openDialog === "reset" && (
        <ResetPasswordDialog user={user} onClose={() => setOpenDialog(null)} />
      )}
      {openDialog === "toggle" && (
        <ToggleActiveDialog user={user} onClose={() => setOpenDialog(null)} />
      )}
    </div>
  );
}

export function AdminUsersPageClient({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const activeAdminCount = users.filter(
    (u) => u.role === "ADMIN" && u.isActive,
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Users</h1>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white transition hover:bg-blue-600"
        >
          {showCreateForm ? "Cancel" : "Create user"}
        </button>
      </div>

      {showCreateForm && (
        <CreateUserForm onSuccess={() => setShowCreateForm(false)} />
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">
                Full name
              </th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">
                Username
              </th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">
                Role
              </th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">
                Unit
              </th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">
                Status
              </th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="max-w-[200px] truncate px-3 py-2 text-slate-900">
                  <Cell value={user.fullName} />
                </td>
                <td className="px-3 py-2 text-slate-700">{user.username}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${ROLE_BADGE_CLASSES[user.role]}`}
                  >
                    {ROLE_LABELS[user.role]}
                  </span>
                </td>
                <td className="max-w-[160px] truncate px-3 py-2 text-slate-700">
                  <Cell value={user.unit} />
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      user.isActive
                        ? "rounded-full border border-emerald-300 bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
                        : "rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                    }
                  >
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <RowActions
                    user={user}
                    disableLifecycleControls={
                      user.id === currentUserId ||
                      (user.role === "ADMIN" &&
                        user.isActive &&
                        activeAdminCount <= 1)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
