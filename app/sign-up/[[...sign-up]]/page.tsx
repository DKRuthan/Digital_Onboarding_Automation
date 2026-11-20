import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { isClerkAuthActive } from "@/lib/auth/session";

export default function SignUpPage() {
  if (!isClerkAuthActive()) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Sign up</h1>
          <p className="mt-3 text-sm text-slate-600">
            Auth is disabled for local/demo mode.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <SignUp />
    </main>
  );
}
