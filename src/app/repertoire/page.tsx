import { permanentRedirect } from "next/navigation";

// Repertoire is now the homepage at "/". This route stays alive only
// to 301 the legacy URL so Google's existing index, in-the-wild
// share links, and the OAuth `next=/repertoire` cookie path all
// transfer link equity to the new canonical without breaking. Drop
// after a few crawl cycles if nobody complains.
export default async function RepertoireRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) qs.set(k, v);
  const target = qs.toString() ? `/?${qs.toString()}` : "/";
  permanentRedirect(target);
}
