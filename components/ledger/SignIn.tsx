"use client";
import {useState,type FormEvent} from "react";
import {ArrowRight,Eye,EyeOff,LockKeyhole,Mail,ReceiptText,Wallet,UploadCloud,Check} from "lucide-react";
import {browserClient} from "@/lib/supabase/browser";
export default function SignIn(){
  const [email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [visible,setVisible]=useState(false),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState(""),[recover,setRecover]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage("");
    try{
      if(recover){
        const {error}=await browserClient().auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+"/auth/confirm?next=/reset-password"});
        if(error)throw error;setMessage("If this account exists, a password-reset email has been sent.");
      }else{
        const {error}=await browserClient().auth.signInWithPassword({email:email.trim(),password});
        if(error)throw error;window.location.assign("/admin");
      }
    }catch(e){setMessage(e instanceof Error?e.message:"Could not connect. Try again.");}
    finally{setBusy(false);}
  }
  return <main className="login-layout fs-login-layout">
    <section className="fs-login-story" aria-label="Finance workspace introduction">
     <div className="fs-story-brand"><span className="fs-story-symbol">f.</span><span>FINANCE / WORKSPACE</span></div>
     <div className="fs-story-body"><div className="fs-story-pill"><span/>A CLEARER WAY TO BILL</div>
      <h2>Every invoice.<br/>One clear view.</h2>
      <p>Keep your clients, projects, invoices and payments organised in one private workspace.</p>
     </div>
     <div className="fs-story-preview" aria-hidden="true">
      <div className="fs-story-preview-top"><span><ReceiptText size={19}/>YOUR WORKSPACE</span><span className="fs-story-signal"><Check size={14}/></span></div>
      <strong>From work to paid.</strong>
      <div className="fs-story-preview-list">
       <div><span><UploadCloud size={17}/></span><span>Import existing records</span><Check size={14}/></div>
       <div><span><ReceiptText size={17}/></span><span>Create an invoice</span><Check size={14}/></div>
       <div><span><Wallet size={17}/></span><span>Track payments</span><Check size={14}/></div>
      </div>
     </div>
    </section>
    <div className="fs-login-entry">
    <div className="login-brand"><div className="brand-symbol">f.</div><span>FINANCE / WORKSPACE</span></div>
    <section className="login-panel" aria-labelledby="login-title">
      <div className="login-icon"><LockKeyhole size={20}/></div>
      <p className="overline">PRIVATE FINANCE WORKSPACE</p>
      <h1 id="login-title">{recover?"Reset your password":"Good to see you."}</h1>
      <p className="subtle">Track work, invoices and payments in one focused place.</p>
      <form onSubmit={submit} className="stack gap-lg">
        <label className="field-label">Email address<input required type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></label>
        {!recover&&<label className="field-label">Password<span className="input-with-action"><input required type={visible?"text":"password"} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/><button type="button" aria-label={visible?"Hide password":"Show password"} onClick={()=>setVisible(x=>!x)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>}
        {message&&<div className="inline-notice" role="status">{message}</div>}
        <button type="submit" className="button button-primary button-large" disabled={busy}>{busy?"Working…":recover?"Send reset email":"Sign in"}{!busy&&(recover?<Mail size={16}/>:<ArrowRight size={16}/>)}</button>
      </form>
      <button type="button" className="link-button" onClick={()=>{setRecover(x=>!x);setMessage("");}}>{recover?"Back to sign in":"Forgot password?"}</button>
    </section>
    <p className="login-foot">Access is restricted to authorised workspace members.</p>
    </div>
  </main>;
}
