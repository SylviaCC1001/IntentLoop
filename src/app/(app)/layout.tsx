import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { getRequestContext } from "@/lib/tenants/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const { tenant } = await getRequestContext();
  return (
    <AppShell user={user} tenant={tenant}>
      {children}
    </AppShell>
  );
}
