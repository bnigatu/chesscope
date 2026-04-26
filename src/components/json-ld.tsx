/**
 * Inline JSON-LD <script> tag for structured data. React's
 * `dangerouslySetInnerHTML` is the safe path — JSX doesn't render
 * raw JSON inside a <script> reliably (it would HTML-escape quotes).
 *
 * Pass the schema.org object as `data`; we serialize and emit.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // We control the input — no XSS surface. Stringify is sufficient.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
