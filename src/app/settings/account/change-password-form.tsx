"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePassword, type AccountActionState } from "./actions";

export function ChangePasswordForm() {
  const [state, action, pending] = React.useActionState<AccountActionState, FormData>(
    changePassword,
    {},
  );
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="space-y-3">
        <Input
          name="currentPassword"
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          required
        />
        <Input
          name="newPassword"
          type="password"
          placeholder="New password (min 8)"
          autoComplete="new-password"
          required
        />
        <Input
          name="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          required
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-status-down">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-sm text-status-up">
          Password changed. Other sessions have been signed out.
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
