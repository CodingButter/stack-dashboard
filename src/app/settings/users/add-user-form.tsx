"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createUser, type UserActionState } from "./actions";

export function AddUserForm() {
  const [state, action, pending] = React.useActionState<UserActionState, FormData>(
    createUser,
    {},
  );
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Input name="username" placeholder="Username" autoComplete="off" required />
        <Input
          name="password"
          type="password"
          placeholder="Password (min 8)"
          autoComplete="new-password"
          required
        />
        <select
          name="role"
          defaultValue="viewer"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-status-down">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding…" : "Add user"}
      </Button>
    </form>
  );
}
