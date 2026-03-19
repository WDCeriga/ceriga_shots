export default function DashboardLoading() {
  return (
    <div className="p-6 lg:p-8 flex items-center justify-center min-h-[40vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  )
}
