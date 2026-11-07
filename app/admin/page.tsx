import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import FinanceStudio from "@/components/ledger/FinanceStudio";
export default async function Admin(){
 const supabase=await createClient();const {data}=await supabase.auth.getUser();
 if(!data.user)redirect("/");
 const {data:member}=await supabase.from("workspace_members").select("user_id").eq("user_id",data.user.id).maybeSingle();
 if(!member)return <main className="login-layout"><section className="login-panel"><p className="overline">ACCESS RESTRICTED</p><h1>Workspace permission required.</h1><p className="subtle">This account is not a member of the finance workspace.</p><a href="/" className="button button-primary">Return to sign in</a></section></main>;
 return <FinanceStudio initialView="overview" email={data.user.email??""}/>;
}
