import type { Resume } from "@/lib/api";

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-6 border-b border-accent/30 pb-1 text-xs font-bold uppercase tracking-[0.14em] text-accent">
      {children}
    </h3>
  );
}

function joined(...parts: string[]) {
  return parts.filter((p) => p?.trim()).join(" · ");
}

/** Renders the tailored resume as a clean, paper-like document. */
export function ResumeView({ resume, matched }: { resume: Resume; matched: string[] }) {
  const matchedSet = new Set(matched.map((s) => s.toLowerCase()));

  return (
    <article className="mx-auto max-w-[800px] rounded-xl border border-line bg-paper px-6 py-8 text-[15px] leading-relaxed shadow-sm sm:px-10">
      <header className="text-center">
        {resume.name && <h2 className="text-2xl font-bold tracking-tight">{resume.name}</h2>}
        {resume.headline && <p className="mt-0.5 text-muted">{resume.headline}</p>}
        {resume.contact.length > 0 && (
          <p className="mt-1.5 break-words text-sm text-muted">{resume.contact.join("  |  ")}</p>
        )}
      </header>

      {resume.summary && (
        <>
          <Heading>Summary</Heading>
          <p>{resume.summary}</p>
        </>
      )}

      {resume.skills.length > 0 && (
        <>
          <Heading>Skills</Heading>
          <ul className="flex flex-wrap gap-1.5">
            {resume.skills.map((skill) => {
              const hit = matchedSet.has(skill.toLowerCase());
              return (
                <li
                  key={skill}
                  title={hit ? "Matches the job description" : undefined}
                  className={`rounded-full px-2.5 py-0.5 text-sm ${
                    hit ? "bg-emerald-500/15 font-medium text-emerald-700 dark:text-emerald-300" : "bg-subtle"
                  }`}
                >
                  {skill}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {resume.experience.length > 0 && (
        <>
          <Heading>Experience</Heading>
          <div className="space-y-4">
            {resume.experience.map((job, i) => (
              <section key={i}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="font-semibold">{joined(job.title, job.company)}</p>
                  <p className="text-sm text-muted">{joined(job.location, job.dates)}</p>
                </div>
                <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-muted">
                  {job.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {resume.education.length > 0 && (
        <>
          <Heading>Education</Heading>
          <div className="space-y-2">
            {resume.education.map((edu, i) => (
              <div key={i}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="font-semibold">{joined(edu.degree, edu.institution)}</p>
                  <p className="text-sm text-muted">{edu.dates}</p>
                </div>
                {edu.details && <p className="text-sm">{edu.details}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {resume.extra_sections.map((section, i) => (
        <div key={i}>
          <Heading>{section.heading}</Heading>
          <ul className="list-disc space-y-1 pl-5 marker:text-muted">
            {section.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </article>
  );
}
