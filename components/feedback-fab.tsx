'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'

export function FeedbackFab() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const resetForm = () => {
    setMessage('')
    setContactEmail('')
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) resetForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          pagePath: pathname || '/',
          ...(status === 'authenticated' ? {} : { contactEmail: contactEmail.trim() || undefined }),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      toast({
        title: 'Thanks for the feedback',
        description: 'We read every note and use it to improve Ceriga Shots.',
      })
      handleOpenChange(false)
    } catch (err) {
      toast({
        title: 'Could not save feedback',
        description: err instanceof Error ? err.message : 'Please try again in a moment.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[110] flex h-14 w-14 shrink-0 items-center justify-center gap-0 rounded-full border border-accent/40 bg-accent px-0 text-accent-foreground shadow-lg shadow-accent/25 hover:bg-accent/90 md:w-auto md:min-w-0 md:gap-2 md:px-5"
        aria-label="Send feedback"
      >
        <MessageSquarePlus className="h-6 w-6 shrink-0" aria-hidden />
        <span className="hidden text-sm font-semibold tracking-wide md:inline">Feedback</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <form onSubmit={(e) => void handleSubmit(e)}>
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
              <DialogDescription>
                Share bugs, ideas, or anything confusing — your message is saved to our team.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              {status === 'authenticated' && session?.user?.email ? (
                <p className="text-xs text-muted-foreground">
                  Signed in as <span className="text-foreground/90">{session.user.email}</span>
                </p>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="feedback-contact-email">Email (optional)</Label>
                  <Input
                    id="feedback-contact-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    maxLength={320}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    If you want a reply, leave your email. Otherwise feedback can be anonymous.
                  </p>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="feedback-message">Your feedback</Label>
                <Textarea
                  id="feedback-message"
                  required
                  placeholder="What would you improve? What felt unclear?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  maxLength={5000}
                  className="resize-y min-h-[120px]"
                />
                <p className="text-[11px] text-muted-foreground text-right">{message.length} / 5000</p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || message.trim().length < 3}>
                {submitting ? 'Sending…' : 'Submit feedback'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
