import { useHashLocation } from "wouter/use-hash-location";
import { ShrinkSection } from "@/components/shrink-section";
import { SecondaryNav } from "@/components/secondary-nav";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";

const LOGO = "https://images.squarespace-cdn.com/content/v1/68fac8a3d20e8d72215ede75/6669040e-00b7-4113-a0c0-a29b3706227f/Asset+26.png?format=200w";

const primary = [
  { title: "Stores", url: "/", testId: "nav-dashboard" },
  { title: "Review", url: "/queue", testId: "nav-review-queue" },
];

interface AppSidebarProps {
  dealershipFilter: number | null;
  onDealershipFilterChange: (id: number | null) => void;
}

export function AppSidebar({ dealershipFilter, onDealershipFilterChange }: AppSidebarProps) {
  const [location] = useHashLocation();

  return (
    <Sidebar>
      <SidebarHeader className="px-5 py-5">
        <a href="#/" className="flex flex-col gap-2" data-testid="link-home-logo">
          <img
            src={LOGO}
            alt="The Cooperative"
            className="h-7 w-auto object-contain brightness-0 dark:invert"
          />
          <span className="font-display text-2xl leading-none">Post Engine</span>
        </a>
      </SidebarHeader>
      <SidebarContent className="px-3 pb-6">
        <nav className="flex flex-col">
          {primary.map((item) => {
            const active = location === item.url;
            return (
              <a
                key={item.url}
                href={`#${item.url}`}
                data-testid={item.testId}
                className={`border-b border-sidebar-border px-2 py-3 text-sm ${active ? "font-medium" : "text-sidebar-foreground/70"}`}
              >
                {item.title}
              </a>
            );
          })}
        </nav>
        <div className="mt-4">
          <ShrinkSection id="more-nav" label="More" hint="Posts, calendar, specs">
            <SecondaryNav
              dealershipFilter={dealershipFilter}
              onDealershipFilterChange={onDealershipFilterChange}
            />
          </ShrinkSection>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
