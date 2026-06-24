import Link from "next/link";

export default function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="text-lg font-bold tracking-tight text-white">
      Trailer<span className="text-accent">Flow</span>
    </Link>
  );
}
