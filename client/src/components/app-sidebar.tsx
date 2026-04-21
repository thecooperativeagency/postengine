import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  ClipboardCheck,
  CalendarDays,
  BookOpen,
  Settings,
  Building2,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery } from "@tanstack/react-query";
import type { Dealership } from "@shared/schema";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Posts", url: "/posts", icon: FileText },
  { title: "New Post", url: "/posts/new", icon: PlusCircle },
  { title: "Review Queue", url: "/queue", icon: ClipboardCheck },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Content Engine", url: "/content-engine", icon: BookOpen },
  { title: "Settings", url: "/settings", icon: Settings },
];

function PostEngineLogo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="PostEngine logo"
    >
      <rect x="2" y="2" width="24" height="24" rx="5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 9h5a4 4 0 010 8h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 9v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M22 17l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface AppSidebarProps {
  dealershipFilter: number | null;
  onDealershipFilterChange: (id: number | null) => void;
}

export function AppSidebar({ dealershipFilter, onDealershipFilterChange }: AppSidebarProps) {
  const [location] = useHashLocation();

  const { data: dealerships } = useQuery<Dealership[]>({
    queryKey: ["/api/dealerships"],
  });

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <a href="#/" className="flex flex-col gap-1" data-testid="link-home-logo">
          <div className="flex items-center gap-2.5">
            <img
              src="https://images.squarespace-cdn.com/content/v1/68fac8a3d20e8d72215ede75/6669040e-00b7-4113-a0c0-a29b3706227f/Asset+26.png?format=200w"
              alt="The Cooperative Agency"
              className="h-7 w-auto object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </div>
          <span className="text-xs text-sidebar-foreground/40 font-medium tracking-wider uppercase pl-0.5">
            PostEngine
          </span>
        </a>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider font-medium">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url ||
                  (item.url === "/posts" && location.startsWith("/posts") && location !== "/posts/new");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <a href={`#${item.url}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider font-medium">
            Filter by Store
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <Select
              value={dealershipFilter?.toString() ?? "all"}
              onValueChange={(val) =>
                onDealershipFilterChange(val === "all" ? null : Number(val))
              }
            >
              <SelectTrigger
                className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                data-testid="select-dealership-filter"
              >
                <Building2 className="h-4 w-4 mr-2 opacity-60" />
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {dealerships?.map((d) => (
                  <SelectItem key={d.id} value={d.id.toString()}>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: d.color }}
                      />
                      {d.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-3 border-t border-sidebar-border/30">
        <div className="flex flex-col gap-0.5">
          <div className="text-xs text-sidebar-foreground/50 font-medium">
            {dealerships?.length ?? 0} accounts managed
          </div>
          <div className="text-xs text-sidebar-foreground/30">
            © 2026 The Cooperative Agency
          </div>
          <a
            href="https://thecooperativeagency.github.io/Ga4-dashboards/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors mt-1"
          >
            ← Command Hub
          </a>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
