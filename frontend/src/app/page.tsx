import { ResumeCustomizer } from "@/components/ResumeCustomizer";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          AI-powered · Never invents experience
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Tailor your resume to any job</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Paste a job description, upload your resume, and get a version that speaks the job&apos;s language — with a
          keyword match score, ATS check, change diff and a cover letter.
        </p>
      </header>
      <ResumeCustomizer />
    </main>
  );
}
