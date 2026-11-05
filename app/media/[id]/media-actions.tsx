"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

/** Client-side interactions for the media detail page, which is a Server Component. */

export function CopyLinkButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => window.navigator.clipboard.writeText(window.location.href)}
    >
      Copy link
    </Button>
  )
}

export function DeleteMediaButton({ mediaId }: { mediaId: string }) {
  const router = useRouter()
  return (
    <Button
      type="button"
      variant="danger"
      onClick={() => {
        if (window.confirm("Delete this media item?")) {
          fetch(`/api/media/${mediaId}`, { method: "DELETE" }).then(() => {
            router.push("/library")
          })
        }
      }}
    >
      Delete
    </Button>
  )
}

export function ReportMediaButton({ mediaId }: { mediaId: string }) {
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      onClick={async () => {
        const reason = window.prompt("Why are you reporting this link?")
        if (!reason) return
        const response = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaId, reason }),
        })
        if (response.ok) {
          window.alert("Report submitted. An administrator will review it.")
        } else {
          window.alert("Failed to submit report.")
        }
      }}
    >
      Report this link
    </Button>
  )
}
