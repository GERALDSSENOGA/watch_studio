"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MediaFormDialog, EditableMediaItem } from "@/components/media-form-dialog"
import { Button } from "@/components/ui/button"

export function AddMediaButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>Add media link</Button>
      <MediaFormDialog
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={() => {
          setOpen(false)
          router.refresh()
        }}
      />
    </>
  )
}
