'use client'

import { MenuIcon } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AccountMenu } from '@/components/account-menu'

export function TopNav() {
  return (
    <header className="fixed md:static top-0 inset-x-0 z-50 h-16 border-b border-border bg-card px-4 sm:px-6 flex items-center justify-between">
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
      <div className="flex items-center gap-3">
        <AccountMenu />
      </div>
    </header>
  )
}
