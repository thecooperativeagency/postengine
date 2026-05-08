import { useQuery } from "@tanstack/react-query";
import {
  BookOpen, Clock, Camera, Users, Palette, Type, Download, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface CadenceRow {
  dealershipName: string;
  postType: string;
  postsPerDay: number;
  daysOfWeek: string;
  platforms: string;
  isActive: boolean;
}

interface OfferQueueData {
  stats: {
    total: number;
    detected: number;
    reviewing: number;
    approved: number;
    rejected: number;
    published: number;
  };
  queue: Array<{
    id: number;
    sourceKey: string;
    brand: string | null;
    accountName: string | null;
    offerTitle: string;
    offerModel: string | null;
    offerType: string | null;
    status: string;
    sourceUrl: string | null;
    expirationDate: string | null;
    updatedAt: string;
  }>;
}

// ── A. Content Cadence ──────────────────────────────────
function ContentCadence() {
  const { data: cadence, isLoading } = useQuery<CadenceRow[]>({
    queryKey: ["/api/content-engine/cadence"],
  });

  if (isLoading) return <Skeleton className="h-32 rounded-lg" />;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Clock className="h-4 w-4" /> Content Cadence
      </h2>
      {!cadence || cadence.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No cadence configured yet — set up in PostEngine Settings.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-2 font-medium">Dealership</th>
                    <th className="text-left px-4 py-2 font-medium">Post Type</th>
                    <th className="text-center px-4 py-2 font-medium">Posts/Day</th>
                    <th className="text-left px-4 py-2 font-medium">Platforms</th>
                  </tr>
                </thead>
                <tbody>
                  {cadence.map((row, i) => {
                    const platforms = JSON.parse(row.platforms) as string[];
                    return (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2 font-medium">{row.dealershipName}</td>
                        <td className="px-4 py-2 text-muted-foreground">{row.postType}</td>
                        <td className="px-4 py-2 text-center">{row.postsPerDay}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1.5">
                            {platforms.map(p => (
                              <Badge key={p} variant="outline" className="text-xs">
                                {p === "googlebusiness" ? "GMB" : p.charAt(0).toUpperCase() + p.slice(1)}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OfferQueue() {
  const { data, isLoading } = useQuery<OfferQueueData>({
    queryKey: ["/api/content-engine/offers"],
  });

  if (isLoading) return <Skeleton className="h-32 rounded-lg" />;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <BookOpen className="h-4 w-4" /> Offer Review Queue
      </h2>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Total {data?.stats.total ?? 0}</Badge>
            <Badge variant="outline">Detected {data?.stats.detected ?? 0}</Badge>
            <Badge variant="outline">Reviewing {data?.stats.reviewing ?? 0}</Badge>
            <Badge variant="outline">Approved {data?.stats.approved ?? 0}</Badge>
          </div>

          {!data || data.queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No offer detections have been written yet. This surface is ready for future BMW/Audi watcher output.</p>
          ) : (
            <div className="space-y-3">
              {data.queue.map((offer) => (
                <div key={offer.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm">{offer.offerTitle}</div>
                      <div className="text-xs text-muted-foreground">
                        {[offer.brand, offer.accountName, offer.offerModel, offer.offerType].filter(Boolean).join(" • ") || offer.sourceKey}
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize">{offer.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(offer.updatedAt).toLocaleString()}
                    {offer.expirationDate ? ` • Expires ${new Date(offer.expirationDate).toLocaleDateString()}` : ""}
                  </div>
                  {offer.sourceUrl ? (
                    <a href={offer.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-block">
                      Open source
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── B. Active Shoots ────────────────────────────────────
const activeShoots = [
  { dealership: "Audi Baton Rouge", description: "Q5 Black Optic feature content (photos + video)", creator: "Adrian", status: "Pending" },
  { dealership: "Audi Baton Rouge", description: "Staff intro videos for Podium", creator: "Adrian", status: "Pending" },
];

function ActiveShoots() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Camera className="h-4 w-4" /> Active Shoots
      </h2>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">Dealership</th>
                  <th className="text-left px-4 py-2 font-medium">Description</th>
                  <th className="text-left px-4 py-2 font-medium">Creator</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeShoots.map((shoot, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 font-medium">{shoot.dealership}</td>
                    <td className="px-4 py-2 text-muted-foreground">{shoot.description}</td>
                    <td className="px-4 py-2">{shoot.creator}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">{shoot.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── C. Content Needed ───────────────────────────────────
const contentNeeded = [
  { dealership: "Brian Harris BMW", color: "#1c69d4", items: ["Feature photos (no front plates)", "Staff intro videos", "M/Sport lot content"] },
  { dealership: "Audi Baton Rouge", color: "#BB0A21", items: ["Q5 Black Optic photos/video", "Staff intro videos", "Q7 lifestyle content"] },
  { dealership: "BMW of Jackson", color: "#1c69d4", items: ["Dealership exterior/aerial shot", "Lot lineup content", "5 Series feature content"] },
  { dealership: "Harris Porsche", color: "#333333", items: ["Dealership exterior/aerial shot", "Parts/merchandise product photos"] },
];

function ContentNeeded() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Camera className="h-4 w-4" /> Content Needed
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {contentNeeded.map((item) => (
          <Card key={item.dealership} className="overflow-hidden">
            <div className="h-1" style={{ backgroundColor: item.color }} />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{item.dealership}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-1">
                {item.items.map((need, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-muted-foreground/50 mt-0.5">-</span>
                    {need}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── D. Brand Guidelines ─────────────────────────────────
const brandGuidelines = [
  { name: "Brian Harris BMW", code: "BHBMW", color: "#1c69d4", font: "BMW Type Next", rules: ["No front plates", "No stock images"] },
  { name: "Audi Baton Rouge", code: "ABR", color: "#BB0A21", font: "Audi Type", rules: ["Dark theme", "No front plates", "No stock images"] },
  { name: "BMW of Jackson", code: "BMW Jackson", color: "#1c69d4", font: "BMW Type Next", rules: ["No front plates", "No stock images"] },
  { name: "Harris Porsche", code: "Harris Porsche", color: "#333333", font: "Porsche Next", rules: ["Black/White/Gray", "Minimalist", "No front plates"] },
];

function BrandGuidelines() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Palette className="h-4 w-4" /> Brand Guidelines
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {brandGuidelines.map((brand) => (
          <Card key={brand.code} className="overflow-hidden">
            <div className="h-1" style={{ backgroundColor: brand.color }} />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{brand.name}</CardTitle>
              <CardDescription className="text-xs">{brand.code}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded border" style={{ backgroundColor: brand.color }} />
                <span className="text-xs font-mono text-muted-foreground">{brand.color}</span>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Type className="h-3 w-3" /> {brand.font}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {brand.rules.map((rule) => (
                  <Badge key={rule} variant="outline" className="text-xs">{rule}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── E. Creator Roster ───────────────────────────────────
const creators = [
  { name: "Adrian Danylle", role: "Video/Film", status: "Active" },
  { name: "Abbie Brunet", role: "Video/Content", status: "Active" },
];

function CreatorRoster() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Users className="h-4 w-4" /> Creator Roster
      </h2>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Role</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {creators.map((c) => (
                <tr key={c.name} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.role}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">{c.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── F. Brand Fonts ──────────────────────────────────────
const bmwWeights = ["Thin", "Light", "Regular", "Medium", "Bold", "Black"];
const audiVariants = ["Normal", "Bold", "Italic", "WideNormal", "WideBold"];

function BrandFonts() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Download className="h-4 w-4" /> Brand Fonts
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">BMW Type Next Pro</CardTitle>
            <CardDescription className="text-xs">.otf files</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {bmwWeights.map((w) => (
              <a
                key={w}
                href={`https://thecooperativeagency.github.io/fonts/bmw/BMWTypeNextPro-${w}.otf`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                BMWTypeNextPro-{w}.otf
              </a>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Audi Type</CardTitle>
            <CardDescription className="text-xs">.woff2 + variable .ttf</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {audiVariants.map((v) => (
              <a
                key={v}
                href={`https://thecooperativeagency.github.io/fonts/audi/AudiType-${v}_4.03.woff2`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                AudiType-{v}_4.03.woff2
              </a>
            ))}
            <a
              href="https://thecooperativeagency.github.io/fonts/audi/AudiTypeVF.ttf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              AudiTypeVF.ttf (Variable)
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────
export default function ContentEngine() {
  return (
    <div className="p-6 space-y-6 max-w-[900px]">
      <div>
        <h1 className="text-xl font-display font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5" /> Content Engine
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Content planning, brand guidelines, and creative resources
        </p>
      </div>

      <ContentCadence />
      <Separator />
      <OfferQueue />
      <Separator />
      <ActiveShoots />
      <Separator />
      <ContentNeeded />
      <Separator />
      <BrandGuidelines />
      <Separator />
      <CreatorRoster />
      <Separator />
      <BrandFonts />
    </div>
  );
}
