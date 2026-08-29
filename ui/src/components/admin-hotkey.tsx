import * as React from "react"
import { useNavigate } from "react-router-dom"
import { paths } from "@infra/routes"

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

export function AdminHotkey() {
  const navigate = useNavigate()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key.toLowerCase() !== "a") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      void navigate(paths.admin.login)
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [navigate])

  return null
}
