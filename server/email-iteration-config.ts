export const EMAIL_ITERATION_REFERENCE_ROOT = "/Users/lucfaucheux/.openclaw/workspace/email-creative";

export type EmailIterationStatus = "active-now" | "later";
export type EmailIterationCampaignType = "sales" | "service";

export type EmailIterationSeedDefinition = {
  dealershipName: string;
  campaignKey: string;
  campaignType: EmailIterationCampaignType;
  status: EmailIterationStatus;
  latestBaseEmailReferenceFile: string | null;
  priorReferenceFiles: string[];
  monthLabel: string;
  campaignLabel: string;
  offerChangesNotes: string;
  photoChangesNotes: string;
  themeCustomBlockNotes: string;
  ctaLinkNotes: string;
  carryoverNotes: string;
};

function ref(pathFromRoot: string) {
  return `${EMAIL_ITERATION_REFERENCE_ROOT}/${pathFromRoot}`;
}

export function buildSeededEmailIterationDefinitions(): EmailIterationSeedDefinition[] {
  return [
    {
      dealershipName: "Audi Baton Rouge",
      campaignKey: "sales-monthly",
      campaignType: "sales",
      status: "active-now",
      latestBaseEmailReferenceFile: ref("Audi Baton Rouge/Sales/abr-may-2026-sales-email.html"),
      priorReferenceFiles: [
        ref("Audi Baton Rouge/Sales/abr-april-2026-sales-email.html"),
        ref("Audi Baton Rouge/Sales/abr-may-2026-loyalty-email.html"),
      ],
      monthLabel: "",
      campaignLabel: "Monthly sales email",
      offerChangesNotes: "",
      photoChangesNotes: "",
      themeCustomBlockNotes: "",
      ctaLinkNotes: "",
      carryoverNotes: "Use the finalized May sales email as the base monthly structure. Loyalty creative is available as an auxiliary reference when a monthly send needs owner/retention messaging.",
    },
    {
      dealershipName: "Audi Baton Rouge",
      campaignKey: "service-monthly",
      campaignType: "service",
      status: "active-now",
      latestBaseEmailReferenceFile: ref("Audi Baton Rouge/Service/audi-br-service-specials-email.html"),
      priorReferenceFiles: [],
      monthLabel: "",
      campaignLabel: "Monthly service email",
      offerChangesNotes: "",
      photoChangesNotes: "",
      themeCustomBlockNotes: "",
      ctaLinkNotes: "",
      carryoverNotes: "Use the existing service specials email as the first-pass base until a deeper month-over-month ABR service history is added.",
    },
    {
      dealershipName: "BMW of Jackson",
      campaignKey: "sales-monthly",
      campaignType: "sales",
      status: "active-now",
      latestBaseEmailReferenceFile: ref("BMW of Jackson/Sales/bmw-jackson-may-2026-email.html"),
      priorReferenceFiles: [
        ref("BMW of Jackson/Sales/bmw-jackson-april-2026-email.html"),
      ],
      monthLabel: "",
      campaignLabel: "Monthly sales email",
      offerChangesNotes: "",
      photoChangesNotes: "",
      themeCustomBlockNotes: "",
      ctaLinkNotes: "",
      carryoverNotes: "Start each new BMW of Jackson sales email from the latest finalized monthly send, then note only the deltas for offers, imagery, and blocks.",
    },
    {
      dealershipName: "BMW of Jackson",
      campaignKey: "service-monthly",
      campaignType: "service",
      status: "later",
      latestBaseEmailReferenceFile: null,
      priorReferenceFiles: [],
      monthLabel: "",
      campaignLabel: "Monthly service email",
      offerChangesNotes: "",
      photoChangesNotes: "",
      themeCustomBlockNotes: "",
      ctaLinkNotes: "",
      carryoverNotes: "BMW of Jackson service iteration is intentionally parked for later because a finalized monthly reference set is not seeded yet.",
    },
    {
      dealershipName: "Brian Harris BMW",
      campaignKey: "sales-monthly",
      campaignType: "sales",
      status: "active-now",
      latestBaseEmailReferenceFile: ref("Brian Harris BMW/Sales/bh-bmw-may-2026-email.html"),
      priorReferenceFiles: [
        ref("Brian Harris BMW/Sales/bh-bmw-april-2026-email.html"),
      ],
      monthLabel: "",
      campaignLabel: "Monthly sales email",
      offerChangesNotes: "",
      photoChangesNotes: "",
      themeCustomBlockNotes: "",
      ctaLinkNotes: "",
      carryoverNotes: "Use the latest finalized Brian Harris BMW sales email as the monthly base and capture deltas before new production starts.",
    },
    {
      dealershipName: "Brian Harris BMW",
      campaignKey: "service-monthly",
      campaignType: "service",
      status: "later",
      latestBaseEmailReferenceFile: ref("Brian Harris BMW/Service/bh-bmw-service-specials-2026.html"),
      priorReferenceFiles: [],
      monthLabel: "",
      campaignLabel: "Monthly service email",
      offerChangesNotes: "",
      photoChangesNotes: "",
      themeCustomBlockNotes: "",
      ctaLinkNotes: "",
      carryoverNotes: "Brian Harris BMW service is seeded as a later workflow. The service specials file is stored as a reference, but this iterator should not be treated as an active monthly default yet.",
    },
    {
      dealershipName: "Harris Porsche",
      campaignKey: "sales-monthly",
      campaignType: "sales",
      status: "active-now",
      latestBaseEmailReferenceFile: ref("Harris Porsche/Sales/harris-porsche-april-2026-email.html"),
      priorReferenceFiles: [],
      monthLabel: "",
      campaignLabel: "Monthly sales email",
      offerChangesNotes: "",
      photoChangesNotes: "",
      themeCustomBlockNotes: "",
      ctaLinkNotes: "",
      carryoverNotes: "Only the finalized April sales email is seeded right now, so use it as the first-pass Harris Porsche monthly sales base until newer finalized sends are added.",
    },
    {
      dealershipName: "Harris Porsche",
      campaignKey: "service-monthly",
      campaignType: "service",
      status: "active-now",
      latestBaseEmailReferenceFile: ref("Harris Porsche/Service/harris-porsche-birthday-email.html"),
      priorReferenceFiles: [],
      monthLabel: "",
      campaignLabel: "Monthly service email",
      offerChangesNotes: "",
      photoChangesNotes: "",
      themeCustomBlockNotes: "",
      ctaLinkNotes: "",
      carryoverNotes: "Seed Harris Porsche service from the current birthday/service reference and treat it as the first monthly iteration base until a broader service history is available.",
    },
  ];
}
