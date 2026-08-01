import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from './contexts/ThemeContext'
import Home from './pages/Home'

function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <Toaster />
        <Home />
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App
