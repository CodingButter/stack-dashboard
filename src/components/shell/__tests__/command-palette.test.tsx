// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

afterEach(cleanup);

// jsdom lacks these browser APIs that cmdk/radix use.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as Record<string, unknown>).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= () => {};

/**
 * Regression: CommandDialog must provide the cmdk `Command` root. Without it,
 * every cmdk child (Input/List/Item) mounts without the store context and
 * crashes with `Cannot read properties of undefined (reading 'subscribe')`
 * the moment the palette opens (found live via ⌘K).
 */
describe("command palette dialog", () => {
  it("renders an open dialog with groups and items without crashing", () => {
    render(
      <CommandDialog open onOpenChange={() => {}} title="Command palette">
        <CommandInput placeholder="Type a command…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigate">
            <CommandItem value="Overview">Overview</CommandItem>
            <CommandItem value="Machines">Machines</CommandItem>
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem value="tdarr pause node">tdarr: Pause node</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>,
    );

    expect(screen.getByPlaceholderText("Type a command…")).not.toBeNull();
    expect(screen.getByText("Overview")).not.toBeNull();
    expect(screen.getByText("tdarr: Pause node")).not.toBeNull();
    // The cmdk root must exist — its absence is exactly the crash condition.
    expect(document.querySelector("[cmdk-root]")).not.toBeNull();
  });
});
