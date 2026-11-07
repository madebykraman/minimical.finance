import {redirect,notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import Workspace from "@/components/ledger/Workspace";
const views=["overview","work","invoices","payments","clients","documents","reports","settings"] as const;
export default async function View({params}:{params:Promise<{view:string}>}){
 const {view}=await params;if(!views.includes(view as typeof views[number]))notFound();
 const supabase=await createClient();const {data}=await supabase.auth.getUser();
 if(!data.user)redirect("/");
 const {data:member}=await supabase.from("workspace_members").select("user_id").eq("user_id",data.user.id).maybeSingle();
 if(!member)return <main className="login-layout"><section className="login-panel"><h1>Access restricted</h1><p>Contact the workspace owner for access.</p></section></main>;
 return <Workspace key={view} initialView={view as typeof views[number]} email={data.user.email??""}/>;
}
