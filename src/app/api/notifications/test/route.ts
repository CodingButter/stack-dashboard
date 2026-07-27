import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getUserSubscriptions } from "@/lib/notifications/db";
import { sendPushToUser } from "@/lib/notifications/send";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const subs = await getUserSubscriptions(session.user.id);
  if (subs.length === 0) {
    return NextResponse.json({ message: "No push subscriptions on this account yet." });
  }

  const sent = await sendPushToUser(session.user.id, {
    title: "Stack Dashboard",
    body: "Push notifications are working on this device.",
    url: "/settings/notifications",
    icon: "/icons/icon-192.png",
  });

  return NextResponse.json(
    { message: `Test notification sent to ${sent} device(s).`, sent },
    { status: 202 },
  );
}
