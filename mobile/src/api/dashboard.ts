// Home screen data: GET /api/v1/orgs/<id>/dashboard.

import { apiRequest, type ClientOptions } from "./client";

export type DashboardEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  signupRequired: boolean;
};

export type DashboardPost = {
  id: string;
  title: string | null;
  publishedAt: string;
};

export type DashboardModel = {
  org: { id: string; slug: string; displayName: string };
  /** The next five events, soonest first. */
  upcomingEvents: DashboardEvent[];
  /** The five latest posts, pinned first. */
  recentPosts: DashboardPost[];
  /** Chats with messages you haven't read. */
  unreadChannels: number;
};

export async function fetchDashboard(
  client: ClientOptions,
  orgId: string,
): Promise<DashboardModel> {
  return apiRequest<DashboardModel>(client, `/orgs/${orgId}/dashboard`);
}

/** "Good morning" etc. for the given time. */
export function greetingFor(now: Date): { day: string; phase: string } {
  const h = now.getHours();
  const phase = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const day = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return { day, phase };
}

export async function submitSupportTicket(
  client: ClientOptions,
  body: { subject: string; body: string; category?: string; orgId?: string },
): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(client, `/support`, {
    method: "POST",
    body,
  });
}
