"use client";

import { useActionState } from "react";
import { updateMyStuff, type MyStuffState } from "@/server-actions/my-stuff";

export function MyStuffForm({
  memberId,
  initial,
  csrf,
}: {
  memberId: string;
  initial: {
    skills: string[];
    interests: string[];
    dietaryFlags: string[];
    shirtSize: string | null;
  };
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<MyStuffState, FormData>(
    updateMyStuff,
    null,
  );
  return (
    <form action={formAction} className="space-y-4">
      {csrf}
      <input type="hidden" name="memberId" value={memberId} />
      <div>
        <label className="label" htmlFor={`skills-${memberId}`}>
          Skills (comma-separated)
        </label>
        <input
          id={`skills-${memberId}`}
          name="skills"
          defaultValue={initial.skills.join(", ")}
          maxLength={2000}
          placeholder="WFA, knot tying, Dutch oven cooking"
          className="field"
        />
        <p className="mt-1 text-xs text-slate-muted">
          Free-form. Leaders use these to pull rosters like &ldquo;who has WFA?&rdquo;
        </p>
      </div>
      <div>
        <label className="label" htmlFor={`interests-${memberId}`}>
          Interests
        </label>
        <input
          id={`interests-${memberId}`}
          name="interests"
          defaultValue={initial.interests.join(", ")}
          maxLength={2000}
          placeholder="climbing, fishing, photography"
          className="field"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor={`diet-${memberId}`}>
            Allergies / dietary
          </label>
          <input
            id={`diet-${memberId}`}
            name="dietaryFlags"
            defaultValue={initial.dietaryFlags.join(", ")}
            maxLength={400}
            placeholder="peanut, vegetarian, gluten-free"
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor={`size-${memberId}`}>
            Shirt size
          </label>
          <input
            id={`size-${memberId}`}
            name="shirtSize"
            defaultValue={initial.shirtSize ?? ""}
            maxLength={20}
            placeholder="AM"
            className="field"
          />
        </div>
      </div>
      {state && "error" in state ? (
        <p className="text-sm text-danger">{state.error}</p>
      ) : null}
      {state && "ok" in state ? (
        <p className="text-sm text-success">Saved.</p>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
