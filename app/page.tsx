import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthScreen } from "@/components/finance/FinanceViews";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/admin");
  return <AuthScreen />;
}
