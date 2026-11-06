export default function Loading() {
  return <main className="auth-screen" role="status" aria-live="polite"><div className="workspace-loader">
    <div className="workspace-loader-head"><div className="loader-logo" aria-hidden="true">m.</div><div><b>Opening MinBooks</b><span>Loading your finance workspace</span></div></div>
    <div className="loader-track"><i/></div><div className="loader-skeleton"><span/><span/><span/></div>
  </div></main>;
}
