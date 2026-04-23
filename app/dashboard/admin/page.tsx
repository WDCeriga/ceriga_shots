import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const ITEMS = [
  {
    href: '/dashboard/admin/statistics',
    title: 'Statistics',
    description: 'Usage metrics, credits consumption, and generation trends.',
  },
  {
    href: '/dashboard/admin/users',
    title: 'Users',
    description: 'User list, roles, and account controls.',
  },
  {
    href: '/dashboard/admin/projects',
    title: 'All Projects',
    description: 'Cross-account project visibility and troubleshooting.',
  },
  {
    href: '/dashboard/admin/jobs',
    title: 'Queue Jobs',
    description: 'Monitor generation queue throughput, failures, and retries.',
  },
  {
    href: '/dashboard/admin/system',
    title: 'System Status',
    description: 'Environment and dependency health checks.',
  },
  {
    href: '/dashboard/admin/feedback',
    title: 'Feedback',
    description: 'User submissions from the floating feedback widget.',
  },
]

export default function AdminIndexPage() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Console</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Operational controls and visibility for Ceriga Shots.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full hover:border-accent transition-colors">
              <CardHeader>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-accent">Open →</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
