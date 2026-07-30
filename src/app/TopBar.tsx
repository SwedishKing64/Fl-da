import Link from "next/link";

export default function TopBar({ cta = true }: { cta?: boolean }) {
  return (
    <header className="bar">
      <div className="wrap bar-in">
        <Link href="/" className="brand">
          <span className="dot" />
          Afterword
        </Link>
        <nav className="bar-nav">
          <Link href="/#how">How it works</Link>
          {cta && (
            <Link href="/app" className="btn primary small">
              Open dashboard
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
