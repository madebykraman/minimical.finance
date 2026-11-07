import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import SignIn from "@/components/ledger/SignIn";
export default async function Home(){
  const supabase=await createClient();const {data}=await supabase.auth.getUser();
  if(data.user)redirect("/admin");
  return <SignIn/>;
}
