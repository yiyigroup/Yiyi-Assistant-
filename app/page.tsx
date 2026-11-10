import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { isEmailAllowed } from "@/lib/auth/allowlist";
import { OpsDashboard } from "@/components/dashboard/ops-dashboard";

export default async function HomePage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");
  if (!isEmailAllowed(email)) redirect("/login?error=AccessDenied");

  return <OpsDashboard email={email} />;
}
