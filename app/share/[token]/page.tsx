import Link from 'next/link'
import { isDatabaseConfigured } from '@/lib/db'
import { getProjectForShareToken } from '@/lib/shares'
import { LightboxAsset, LightboxImage } from '@/components/lightbox-image'

export const dynamic = 'force-dynamic'

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const formatViewTitle = (t: string) => {
    switch (t) {
      case 'flat-lay':
      case 'flatlay_topdown':
        return 'Top-down flat lay'
      case 'flatlay_45deg':
        return 'Steep diagonal overhead flat lay'
      case 'flatlay_sleeves':
        return 'Sleeve spread'
      case 'flatlay_relaxed':
        return 'Relaxed flat lay'
      case 'flatlay_folded':
        return 'Folded retail rectangle shot'
      case 'product-shot':
      case 'surface_hanging':
        return 'Hanging shot'
      case 'surface_draped':
        return 'Draped over surface'
      case 'detail':
      case 'detail_print':
        return 'Print close-up'
      case 'detail_fabric':
        return 'Fabric macro'
      case 'lifestyle':
        return 'Lifestyle'
      case 'detail_collar':
        return 'Collar detail'
      default:
        return t
    }
  }

  const { token } = await params
  if (!isDatabaseConfigured()) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold">Sharing is unavailable</h1>
        <p className="mt-2 text-muted-foreground">
          The server database is not configured.
        </p>
      </div>
    )
  }

  const project = await getProjectForShareToken(token)
  if (!project) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold">Shared link not found</h1>
        <p className="mt-2 text-muted-foreground">This share link is invalid or has expired.</p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight truncate">{project.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(project.createdAt).toLocaleDateString()}
            <span className="mx-2">•</span>
            {project.generatedImages.length} generated
          </p>
        </div>

        <div className="flex gap-3 shrink-0">
          <a
            href={`/api/shares/${token}/download`}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Download All
          </a>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
          >
            Open Ceriga Shots
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
        <aside className="lg:sticky lg:top-6 space-y-6">
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="p-4 border-b border-border">
              <h2 className="text-base font-semibold">Original</h2>
              <p className="text-xs text-muted-foreground mt-1">Reference image used for outputs.</p>
            </div>
            <div className="p-4">
              <div className="rounded-lg overflow-hidden border border-border">
                <img
                  src={project.originalImage}
                  alt={project.originalImageName || 'Original'}
                  className="w-full aspect-square object-cover"
                />
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Generated Content</h2>
            <p className="text-xs text-muted-foreground">{project.generatedImages.length ? 'Ready' : 'No outputs'}</p>
          </div>

          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {project.generatedImages.map((img) => (
              <div
                key={img.id}
                className="rounded-xl overflow-hidden border border-border bg-card hover:border-accent transition-colors"
              >
                {img.url ? (
                  <LightboxImage
                    src={img.url}
                    alt={img.type}
                    title={formatViewTitle(img.type)}
                    imgClassName="w-full aspect-square object-cover"
                  />
                ) : (
                  <LightboxAsset title={formatViewTitle(img.type)} prompt={img.prompt}>
                    <div className="w-full aspect-square flex items-center justify-center bg-secondary/50">
                      <p className="text-sm font-medium text-muted-foreground">{formatViewTitle(img.type)}</p>
                    </div>
                  </LightboxAsset>
                )}
                <div className="px-3 py-2 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center">
                    {formatViewTitle(img.type)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

