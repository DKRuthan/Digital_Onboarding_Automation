import { resolveOperatorRole } from "@/lib/auth/api-auth";
import {
  getAuthStatusLabel,
  isClerkAuthActive,
} from "@/lib/auth/session";

const STATIC_LABELS = {
  disabled: "Operator auth: disabled (demo mode)",
  misconfigured: "Operator auth: enabled but Clerk keys missing",
} as const;

async function resolveEnabledAuthLabel(): Promise<string> {
  if (!isClerkAuthActive()) {
    return "Operator auth: enabled";
  }

  try {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const { userId } = await auth();

    if (!userId) {
      return "Operator auth: enabled — sign in required";
    }

    const user = await currentUser();
    const role = await resolveOperatorRole();
    const displayName =
      user?.primaryEmailAddress?.emailAddress ??
      user?.fullName ??
      user?.username;

    if (displayName) {
      return `Operator auth: signed in as ${displayName} · Role: ${role}`;
    }

    return `Operator auth: signed in · Role: ${role}`;
  } catch {
    return "Operator auth: enabled";
  }
}

export async function AuthStatusNote() {
  const status = getAuthStatusLabel();

  if (status === "disabled" || status === "misconfigured") {
    return (
      <p className="text-xs font-medium text-slate-500">
        {STATIC_LABELS[status]}
      </p>
    );
  }

  const label = await resolveEnabledAuthLabel();

  return <p className="text-xs font-medium text-slate-500">{label}</p>;
}
