import { describe, expect, it } from "vitest";

import { buildNotificationView } from "../payload";

describe("buildNotificationView", () => {
  it("passes through provided fields", () => {
    const view = buildNotificationView({
      title: "New Movie: Gremlins",
      body: "Movies",
      url: "/recently-added",
      icon: "/icons/icon-512.png",
      badge: "/icons/favicon-48.png",
    });
    expect(view.title).toBe("New Movie: Gremlins");
    expect(view.options.body).toBe("Movies");
    expect(view.options.icon).toBe("/icons/icon-512.png");
    expect(view.options.badge).toBe("/icons/favicon-48.png");
    expect(view.options.data.url).toBe("/recently-added");
  });

  it("applies defaults for missing fields", () => {
    const view = buildNotificationView({});
    expect(view.title).toBe("Stack Dashboard");
    expect(view.options.body).toBe("");
    expect(view.options.icon).toBe("/icons/icon-192.png");
    expect(view.options.badge).toBe("/icons/favicon-32.png");
    expect(view.options.data.url).toBe("/");
  });

  it("defaults the click url to root when only title/body given", () => {
    const view = buildNotificationView({ title: "Plex down", body: "unreachable" });
    expect(view.options.data.url).toBe("/");
  });
});
