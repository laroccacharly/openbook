import { useNavigate } from "react-router-dom"
import { paths } from "@infra/routes"
import { Button } from "@/components/ui/button"

export function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-6">
          <span className="font-heading font-semibold">Book</span>
          <div className="ml-auto">
            <Button
              variant="outline"
              onClick={() => void navigate(paths.worker.signIn)}
            >
              Sign in
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col p-6" />
    </div>
  )
}
