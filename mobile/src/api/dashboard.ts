// Dashboard view-model fetcher. Mirrors the server's lib/dashboard
// shape so the mobile home screen can rely on the same data the
// admin dashboard renders.

import { apiRequest, type ClientOptions } from "./client";

export type DashboardStat = {
  value: number | string;
  hint: string;
  /** Semantic palette key — "primary" / "accent" / "sky" / etc. */
  color: string;
};

export type DashboardEvent = {
  id: string;
  title: string;
  startsAt: string;
  category: string | null;
  color: string;
  yes: number;
  capacity: number;
};

export type DashboardActivity = {
  kind: "post" | "rsvp" | "reimbursement";
  who: string;
  what: string;
  at: string;
  color: string;
  icon: string;
};

export type DashboardRosterMember = {
  id: string;
  firstName: string;
  lastName: string;
  patrol: string | null;
};

export type DashboardModel = {
  greeting: { day: string; phase: string };
  stats: {
    scouts: DashboardStat;
    rsvps: DashboardStat;
    treasurer: DashboardStat;
    messages: DashboardStat;
  };
  events: DashboardEvent[];
  activity: DashboardActivity[];
  photosThisWeek: number;
  rosterPreview: DashboardRosterMember[];
};

export async function fetchDashboard(
  client: ClientOptions,
  orgId: string,
): Promise<DashboardModel> {
  return apiRequest<DashboardModel>(client, `/orgs/${orgId}/dashboard`);
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
