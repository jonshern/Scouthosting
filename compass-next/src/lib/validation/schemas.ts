import { z } from "zod";

export const Email = z.string().trim().toLowerCase().email().max(320);

export const SignupSchema = z.object({
  email: Email,
  password: z.string().min(12).max(200),
  displayName: z.string().trim().min(1).max(100),
});

export const LoginSchema = z.object({
  email: Email,
  password: z.string().min(1).max(200),
});

export const ProvisionSchema = z.object({
  unitType: z.enum(["Troop", "Pack", "Crew", "Ship", "Post", "GirlScoutTroop"]),
  unitNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]+$/u, "Unit number must be letters and digits only")
    .min(1)
    .max(10),
  charterOrg: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2),
  council: z.string().trim().max(200).optional().nullable(),
  district: z.string().trim().max(200).optional().nullable(),
  founded: z.string().trim().max(20).optional().nullable(),
  meetingDay: z.string().trim().max(50).default("Mondays"),
  meetingTime: z.string().trim().max(50).default("7:00 PM"),
  meetingLocation: z.string().trim().max(200).optional().nullable(),
  scoutmasterName: z.string().trim().min(1).max(100),
  scoutmasterEmail: Email,
  committeeChairEmail: Email.optional().nullable(),
  plan: z.enum(["patrol", "troop", "council"]).default("patrol"),
});

export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ProvisionInput = z.infer<typeof ProvisionSchema>;
