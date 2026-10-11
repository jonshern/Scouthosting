"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { roleInOrg } from "@/lib/auth/role";

const VALID_TYPES = new Set(["text", "long", "yesno", "select", "multi", "scale"]);

type Question = {
  id: string;
  type: string;
  label: string;
  options?: string[];
  required?: boolean;
};

function parseQuestions(raw: string): Question[] {
  const out: Question[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [type, label, optsRaw] = trimmed.split("|").map((s) => s.trim());
    if (!type || !label || !VALID_TYPES.has(type)) continue;
    const q: Question = {
      id: crypto.randomBytes(4).toString("hex"),
      type,
      label,
      required: true,
    };
    if ((type === "select" || type === "multi") && optsRaw) {
      q.options = optsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    out.push(q);
  }
  return out;
}

const CreateSchema = z.object({
  orgSlug: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric + dashes."),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  audience: z.string().min(1),
  closesAt: z.string().optional().or(z.literal("")),
  questions: z.string().min(1),
});

async function authorize(orgSlug: string) {
  const { user } = await getSession();
  if (!user) throw new Error("Sign in.");
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) throw new Error("Org not found.");
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    throw new Error("Forbidden.");
  }
  return org;
}

export async function createSurvey(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const parsed = CreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");
  const audience = parsed.data.audience === "members" ? "members" : "anyone";
  const questions = parseQuestions(parsed.data.questions);
  if (!questions.length) throw new Error("Add at least one valid question.");

  const org = await authorize(parsed.data.orgSlug);

  await prisma.survey.create({
    data: {
      orgId: org.id,
      title: parsed.data.title,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      audience,
      closesAt: parsed.data.closesAt ? new Date(parsed.data.closesAt) : null,
      questions: questions as never,
    },
  });
  redirect(`/o/${parsed.data.orgSlug}/admin/surveys`);
}

export async function submitSurvey(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const surveyId = String(formData.get("surveyId") ?? "");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const surveySlug = String(formData.get("surveySlug") ?? "");
  if (!surveyId) throw new Error("Missing survey.");

  const survey = await prisma.survey.findFirst({
    where: { id: surveyId, org: { slug: orgSlug } },
  });
  if (!survey) throw new Error("Survey not found.");
  if (survey.closesAt && survey.closesAt.getTime() < Date.now()) {
    throw new Error("Survey closed.");
  }

  const { user } = await getSession();
  if (survey.audience === "members") {
    if (!user) throw new Error("Sign in to respond.");
    if (!(await roleInOrg(user.id, survey.orgId)) && !user.isSuperAdmin) {
      throw new Error("Members only.");
    }
  }

  // Build the answers map by walking the question definitions.
  const questions = (survey.questions as unknown as Question[]) ?? [];
  const answers: Record<string, unknown> = {};
  for (const q of questions) {
    const key = `q.${q.id}`;
    const all = formData.getAll(key);
    if (q.type === "multi") {
      answers[q.id] = all.map((v) => String(v));
    } else if (q.type === "yesno") {
      const v = String(all[0] ?? "").toLowerCase();
      answers[q.id] = v === "yes" ? true : v === "no" ? false : null;
    } else if (q.type === "scale") {
      const v = Number(all[0] ?? "");
      answers[q.id] = Number.isFinite(v) ? v : null;
    } else {
      answers[q.id] = String(all[0] ?? "").trim() || null;
    }
  }

  const name = user
    ? user.displayName
    : String(formData.get("_name") ?? "").trim();
  const email = user
    ? user.email
    : String(formData.get("_email") ?? "").trim().toLowerCase() || null;
  if (!name) throw new Error("Name is required.");

  await prisma.surveyResponse.create({
    data: {
      orgId: survey.orgId,
      surveyId: survey.id,
      userId: user?.id ?? null,
      name,
      email,
      answers: answers as never,
    },
  });
  redirect(`/o/${orgSlug}/survey/${surveySlug}?submitted=1`);
}
