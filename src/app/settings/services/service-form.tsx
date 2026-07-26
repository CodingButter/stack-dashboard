"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthKind } from "@/poller/services";
import { saveService, type ServiceActionState } from "./actions";

export function ServiceForm({
  service,
  auth,
  urlHint,
  urlSet,
  keySet,
}: {
  service: string;
  auth: AuthKind;
  urlHint: string;
  urlSet: boolean;
  keySet: boolean;
}) {
  const [state, action, pending] = React.useActionState<
    ServiceActionState,
    FormData
  >(saveService, {});

  const secretPlaceholder = keySet ? "•••••• (leave blank to keep)" : "API key";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="service" value={service} />
      <Input
        name="url"
        placeholder={urlHint}
        defaultValue=""
        autoComplete="off"
        aria-label={`${service} URL`}
      />
      {urlSet ? (
        <p className="stat-num text-xs text-muted-foreground">URL currently set</p>
      ) : null}

      {auth === "userpass" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            name="username"
            placeholder="Username"
            autoComplete="off"
            aria-label={`${service} username`}
          />
          <Input
            name="password"
            type="password"
            placeholder={secretPlaceholder}
            autoComplete="new-password"
            aria-label={`${service} password`}
          />
        </div>
      ) : auth === "none" ? null : (
        <Input
          name="apikey"
          type="password"
          placeholder={secretPlaceholder}
          autoComplete="new-password"
          aria-label={`${service} API key`}
        />
      )}

      {state.error ? (
        <p role="alert" className="text-sm text-status-down">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-status-up">{state.message}</p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
