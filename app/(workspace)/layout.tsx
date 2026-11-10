import { WorkspaceLayout } from "@/components/app/workspace-layout"

export default function Layout({ children }: { children: React.ReactNode }) {
  return <WorkspaceLayout>{children}</WorkspaceLayout>
}
