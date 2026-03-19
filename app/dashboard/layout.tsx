import { AppSidebar } from '@/components/app-sidebar'
import { TopNav } from '@/components/top-nav'
import { ProjectsProvider } from '@/components/projects-provider'
import { VerifyEmailBanner } from '@/components/verify-email-banner'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProjectsProvider>
      <div className="flex min-h-dvh md:h-screen bg-background">
        <AppSidebar className="hidden md:flex" />
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <TopNav />
          <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain pt-16 pb-6 md:pt-0 md:pb-0">
            <VerifyEmailBanner />
            {children}
          </main>
        </div>
      </div>
    </ProjectsProvider>
  )
}
