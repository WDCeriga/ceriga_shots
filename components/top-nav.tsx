'use client'

import { MenuIcon } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export function TopNav() {
  return (
    <header className="border-b border-border bg-card px-4 sm:px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation menu"
            >
              <MenuIcon className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <AppSidebar variant="mobile" className="w-full border-r-0" />
          </SheetContent>
        </Sheet>
      </div>
      <div className="text-sm text-muted-foreground">
        Welcome to Ceriga Shots
      </div>
    </header>
  )
}
