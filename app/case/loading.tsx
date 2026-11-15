import { Shell } from "@/components/shell";
export default function Loading() {
  return (
    <Shell>
      <div className="stack" role="status" aria-busy="true">
        <h1>Opening your case</h1>
        <div className="skeleton" />
        <div className="skeleton" />
        <p>Loading your evidence and case details…</p>
      </div>
    </Shell>
  );
}
