import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CustomerDataProvider } from "@/components/providers/customer-data-provider";
import { getEffectivePermissionsForSession } from "@/lib/auth/operator-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authRequired, role, permissions } =
    await getEffectivePermissionsForSession();

  return (
    <CustomerDataProvider>
      <DashboardShell
        authRequired={authRequired}
        role={role}
        permissions={permissions}
      >
        {children}
      </DashboardShell>
    </CustomerDataProvider>
  );
}
