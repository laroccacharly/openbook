import { StrictMode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRoot } from "react-dom/client"
import { HashRouter } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./index.css"
import App from "./App.tsx"

const queryClient = new QueryClient()

const rootElement = document.getElementById("root")
if (rootElement === null) {
  throw new Error("Root element not found")
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
