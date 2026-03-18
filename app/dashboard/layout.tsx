import { AppSidebar } from '@/components/app-sidebar'
import { TopNav } from '@/components/top-nav'
import { ProjectsProvider } from '@/components/projects-provider'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProjectsProvider>
      <div className="flex h-screen bg-background">
        <AppSidebar className="hidden md:flex" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopNav />
          <main className="flex-1 overflow-auto pt-16 md:pt-0">{children}</main>
        </div>
      </div>
    </ProjectsProvider>
  )
}
