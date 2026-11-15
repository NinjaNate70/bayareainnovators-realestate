import type { Metadata } from "next";
import { DocumentsLibrary } from "@/components/documents-library";
export const metadata: Metadata = { title: "My documents | Tenant Shield" };
export default function DocumentsPage() {
  return <DocumentsLibrary />;
}
