import Link from "next/link";
import { Wordmark } from "./knight-mark";

export function Header() {
  return (
    <header className="border-b border-parchment-50/8">
      <div className="container-wide flex items-center justify-between h-16">
        <Link href="/" aria-label="Chesscope home" className="group">
          <Wordmark className="text-lg group-hover:text-brass-light transition-colors" />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 text-sm">
          <NavLink href="/">Search</NavLink>
          <NavLink href="/repertoire">Repertoire</NavLink>
          <NavLink href="/about">About</NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-parchment-100/80 hover:text-parchment-50 transition-colors"
    >
      {children}
    </Link>
  );
}
