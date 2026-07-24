"use client";

import * as React from "react";
import { TerminalSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = React.useActionState<LoginState, FormData>(
    login,
    {},
  );

  return (
    <form
      action={action}
      className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <TerminalSquare className="size-8 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight">
          stack<span className="text-primary">dash</span>
        </h1>
        <p className="text-xs text-muted-foreground">
          NAS media stack command center
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="username" className="text-xs font-medium text-muted-foreground">
            Username
          </label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoFocus
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-status-down">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
