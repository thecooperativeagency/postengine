import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DASHBOARD_USER_EVENT,
  DASHBOARD_USER_KEY,
  readSectionOpen,
  sectionMemoryKey,
  writeSectionOpen,
} from "@/lib/section-memory";

export function useDashboardUser() {
  const [user, setUser] = useState("owner");

  useEffect(() => {
    const read = () => setUser(window.sessionStorage.getItem(DASHBOARD_USER_KEY)?.trim() || "owner");
    read();
    window.addEventListener(DASHBOARD_USER_EVENT, read);
    return () => window.removeEventListener(DASHBOARD_USER_EVENT, read);
  }, []);

  return user;
}

function persistSection(user: string, id: string, open: boolean) {
  const key = sectionMemoryKey(user);
  const next = writeSectionOpen(window.localStorage.getItem(key), id, open);
  window.localStorage.setItem(key, next);
}

interface ShrinkSectionProps {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
  testId?: string;
}

export function ShrinkSection({ id, label, hint, children, testId }: ShrinkSectionProps) {
  const user = useDashboardUser();
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(readSectionOpen(window.localStorage.getItem(sectionMemoryKey(user)), id));
  }, [user, id]);

  function set(next: boolean) {
    setOpen(next);
    persistSection(user, id, next);
  }

  const button = (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 border border-border bg-card px-4 py-3 text-left"
      aria-expanded={open}
      onClick={() => set(!open)}
      data-testid={testId || `shrink-${id}`}
    >
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );

  if (mobile) {
    return (
      <div>
        {button}
        <Drawer open={open} onOpenChange={set}>
          <DrawerContent className="max-h-[85vh] rounded-none">
            <DrawerHeader className="text-left">
              <DrawerTitle className="font-display text-3xl font-normal">{label}</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-auto px-4 pb-10">{children}</div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  return (
    <section>
      {button}
      {open ? <div className="border border-t-0 border-border bg-card p-4">{children}</div> : null}
    </section>
  );
}
