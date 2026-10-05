import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin-dashboard";
import { parseAccountId, parseAdminView } from "@/lib/admin/data";
import { loadAdminData } from "@/lib/admin/server";
import { APP_NAME } from "@/lib/brand";
import { logServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Admin · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

/**
 * The read-only admin dashboard. Only accounts listed in `app_admins` (added
 * with SQL, migration 0018) can open it; everyone else gets a plain 404.
 */
export default async function AdminPage(props: PageProps<"/admin">) {
  const searchParams = await props.searchParams;
  const view = parseAdminView(searchParams.view);
  const detailId = parseAccountId(searchParams.user);

  const data = await logServerTiming("page /admin", () => loadAdminData(detailId));
  if (data === "signed-out") redirect("/auth/sign-in");
  if (data === "forbidden") notFound();

  return <AdminDashboard data={data} initialView={view} detailId={detailId} />;
}
