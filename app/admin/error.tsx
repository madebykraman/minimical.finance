"use client";
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="auth-screen"><section className="auth-card" role="alert">
    <span className="eyebrow">WORKSPACE ERROR</span><h1>We couldn't open this view.</h1>
    <p>{error.digest ? "Reference: "+error.digest : "Your saved finance records have not been changed."}</p>
    <button type="button" className="primary auth-submit" onClick={reset}>Try again</button>
  </section></main>;
}
