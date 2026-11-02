import { useState } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { SecondaryNav } from "@/components/secondary-nav";

interface MobileDockProps {
  dealershipFilter: number | null;
  onDealershipFilterChange: (id: number | null) => void;
}

export function MobileDock({ dealershipFilter, onDealershipFilterChange }: MobileDockProps) {
  const [location] = useHashLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = [
    { title: "Stores", url: "/", testId: "tab-stores", active: location === "/" },
    { title: "Review", url: "/queue", testId: "tab-review", active: location === "/queue" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden">
      <div className="grid grid-cols-3">
        {tabs.map((tab) => (
          <a
            key={tab.url}
            href={`#${tab.url}`}
            data-testid={tab.testId}
            className={`px-2 py-3 text-center text-sm ${tab.active ? "font-medium" : "text-muted-foreground"}`}
          >
            {tab.title}
          </a>
        ))}
        <button
          type="button"
          className="px-2 py-3 text-center text-sm text-muted-foreground"
          data-testid="button-sidebar-toggle"
          onClick={() => setMoreOpen(true)}
        >
          More
        </button>
      </div>
      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent className="rounded-none">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-3xl font-normal">More</DrawerTitle>
          </DrawerHeader>
          <div
            className="px-4 pb-8"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setMoreOpen(false);
            }}
          >
            <SecondaryNav
              dealershipFilter={dealershipFilter}
              onDealershipFilterChange={onDealershipFilterChange}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </nav>
  );
}
