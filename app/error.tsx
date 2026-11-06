"use client";
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="auth-screen"><section className="auth-card" role="alert">
    <span className="eyebrow">FINANCE WORKSPACE</span><h1>Something went wrong.</h1>
    <p>The page couldn't be loaded. Your saved records are unaffected.</p>
    <button type="button" className="primary auth-submit" onClick={reset}>Reload view</button>
  </section></main>;
}
