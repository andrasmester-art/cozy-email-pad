import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useTheme, type Theme } from "@/lib/theme";

// Téma-választó gomb a Sidebar aljára. A jelenlegi módnak megfelelő
// ikont mutatja (nap / hold / monitor), és három opciót kínál.
export function ThemeToggle() {
  const { theme, setTheme, isDark } = useTheme();

  const Icon = theme === "system" ? Monitor : isDark ? Moon : Sun;
  const label =
    theme === "system" ? "Téma: Rendszer" : isDark ? "Téma: Sötét" : "Téma: Világos";

  const opt = (value: Theme, text: string, OptIcon: typeof Sun) => (
    <DropdownMenuItem
      onClick={() => setTheme(value)}
      className={theme === value ? "bg-accent text-accent-foreground" : ""}
    >
      <OptIcon className="h-4 w-4 mr-2" /> {text}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          title={label}
        >
          <Icon className="h-4 w-4" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <DropdownMenuLabel>Megjelenés</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {opt("light", "Világos", Sun)}
        {opt("dark", "Sötét", Moon)}
        {opt("system", "Rendszer szerint", Monitor)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
