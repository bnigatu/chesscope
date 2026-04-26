import { cx } from "@/lib/utils";

export function Filters() {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[.25em] text-brass">
        Filters
      </h2>
      <div className="space-y-3 px-3 py-3 bg-ink-800/60 border border-parchment-50/8 rounded-sm">
        <Row label="Color">
          <div className="flex items-center gap-3 text-sm">
            <Radio name="color" value="white" defaultChecked label="White" />
            <Radio name="color" value="black" label="Black" />
            <Radio name="color" value="both" label="Both" />
          </div>
        </Row>

        <Row label="Time control">
          <Select>
            <option>Any</option>
            <option>Bullet</option>
            <option>Blitz</option>
            <option>Rapid</option>
            <option>Classical</option>
          </Select>
        </Row>

        <Row label="Date range">
          <div className="flex items-center gap-2">
            <DateInput placeholder="from" />
            <span className="text-parchment-300/40">→</span>
            <DateInput placeholder="to" />
          </div>
        </Row>

        <Row label="Min rating">
          <NumberInput placeholder="0" />
        </Row>

        <Row label="Min games / line">
          <NumberInput placeholder="2" />
        </Row>
      </div>

      <button
        type="button"
        className={cx(
          "w-full mt-2 px-4 py-2.5",
          "border border-brass/50 text-brass-light",
          "font-mono text-xs uppercase tracking-[.25em]",
          "hover:bg-brass/10 hover:border-brass transition-colors"
        )}
      >
        Build / Update tree
      </button>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[11px] uppercase tracking-[.18em] text-parchment-300/60 w-28 shrink-0">
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Radio({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-parchment-100/85">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="accent-brass"
      />
      {label}
    </label>
  );
}

const inputClass = cx(
  "w-full bg-transparent outline-none",
  "text-sm font-mono text-parchment-100",
  "placeholder:text-parchment-300/40",
  "border-b border-parchment-50/10 focus:border-brass/70 transition-colors",
  "px-1 py-1"
);

function Select({ children }: { children: React.ReactNode }) {
  return (
    <select className={cx(inputClass, "appearance-none bg-ink-800")}>
      {children}
    </select>
  );
}

function DateInput({ placeholder }: { placeholder: string }) {
  return <input type="date" placeholder={placeholder} className={inputClass} />;
}

function NumberInput({ placeholder }: { placeholder: string }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      placeholder={placeholder}
      className={inputClass}
    />
  );
}
