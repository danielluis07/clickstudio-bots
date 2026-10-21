import type { Metadata } from "next";
import { KnowledgeBaseEditor } from "@/components/knowledge-base/knowledge-base-editor";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Base de conhecimento",
  robots: { index: false },
};

export default async function KnowledgeBasePage() {
  const scope = await requireTenantScope();

  return <KnowledgeBaseEditor scope={scope} />;
}
