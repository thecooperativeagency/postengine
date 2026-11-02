import { Building2, Moon, Sun } from "lucide-react";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery } from "@tanstack/react-query";
import type { Dealership } from "@shared/schema";
import { useTheme } from "@/components/theme-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const links = [
  { title: "Posts", url: "/posts", testId: "nav-posts" },
  { title: "Calendar", url: "/calendar", testId: "nav-calendar" },
  { title: "New Post", url: "/posts/new", testId: "nav-new-post" },
  { title: "Post Specs", url: "/settings", testId: "nav-post-specs" },
];

interface SecondaryNavProps {
  dealershipFilter: number | null;
  onDealershipFilterChange: (id: number | null) => void;
}

export function SecondaryNav({ dealershipFilter, onDealershipFilterChange }: SecondaryNavProps) {
  const [location] = useHashLocation();
  const { theme, toggleTheme } = useTheme();
  const { data: dealerships } = useQuery<Dealership[]>({
    queryKey: ["/api/dealerships"],
  });

  return (
    <div className="space-y-4">
      <nav className="flex flex-col">
        {links.map((item) => {
          const active = location === item.url || (item.url === "/posts" && location.startsWith("/posts") && location !== "/posts/new");
          return (
            <a
              key={item.url}
              href={`#${item.url}`}
              data-testid={item.testId}
              className={`border-b border-border py-3 text-sm ${active ? "font-medium" : "text-muted-foreground"}`}
            >
              {item.title}
            </a>
          );
        })}
      </nav>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Store</div>
        <Select
          value={dealershipFilter?.toString() ?? "all"}
          onValueChange={(val) => onDealershipFilterChange(val === "all" ? null : Number(val))}
        >
          <SelectTrigger data-testid="select-dealership-filter" className="bg-card">
            <Building2 className="mr-2 h-4 w-4 opacity-60" />
            <SelectValue placeholder="All stores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stores</SelectItem>
            {dealerships?.map((dealer) => (
              <SelectItem key={dealer.id} value={dealer.id.toString()}>
                {dealer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <button
        type="button"
        onClick={toggleTheme}
        data-testid="button-theme-toggle"
        className="flex w-full items-center justify-between border border-border px-3 py-2 text-sm"
      >
        <span>{theme === "dark" ? "Paper" : "Night"}</span>
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <a
        href="https://hub.thecoopbrla.com"
        className="block text-xs text-muted-foreground underline underline-offset-4"
      >
        Operator Hub
      </a>
    </div>
  );
}
