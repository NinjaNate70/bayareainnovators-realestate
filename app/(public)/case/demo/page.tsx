import { Suspense } from "react";
import { CaseFile } from "@/components/case-file";
import { demoCase } from "@/lib/fixtures/demo-case";

const example = {
  ...demoCase,
  incoming: [
    "Hi Alex,",
    "I reviewed your questions about the Cedar Street deductions. The $150 cleaning charge was a flat fee from our turnover crew. I can send a breakdown, but I don’t have the invoice on hand. I’m still checking when the bedroom carpet was last replaced.",
    "Cedar Street Property Management",
  ].join("\n\n"),
};

export const metadata = { title: "Cedar Street demo case | Tenant Shield" };

export default function DemoCasePage() {
  return (
    <Suspense fallback={<p role="status">Opening the demo case…</p>}>
      <CaseFile id={example.id} example={example} />
    </Suspense>
  );
}
