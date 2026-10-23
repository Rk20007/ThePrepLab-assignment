import { JD_MAX_CHARS, JD_MIN_CHARS } from "@/lib/api";

interface Props {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function JobDescriptionInput({ value, onChange, error }: Props) {
  const length = value.trim().length;
  const tooShort = length > 0 && length < JD_MIN_CHARS;

  return (
    <div>
      <label htmlFor="jd" className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
        <span>Job description</span>
        <span className={`text-xs tabular-nums ${tooShort ? "text-amber-600" : "text-muted"}`}>
          {length.toLocaleString()} / {JD_MAX_CHARS.toLocaleString()}
        </span>
      </label>
      <textarea
        id="jd"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={JD_MAX_CHARS}
        rows={11}
        placeholder="Paste the full job description here — responsibilities, requirements, nice-to-haves…"
        aria-invalid={!!error}
        aria-describedby="jd-help"
        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 aria-[invalid=true]:border-red-500"
      />
      <p id="jd-help" className={`mt-1 text-xs ${error ? "text-red-600" : "text-muted"}`}>
        {error ?? (tooShort ? `At least ${JD_MIN_CHARS} characters needed.` : "More detail gives better tailoring.")}
      </p>
    </div>
  );
}
