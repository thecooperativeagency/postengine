import { afterEach, test } from "node:test";
import * as assert from "node:assert/strict";
import {
  authenticateDashboardPin,
  clearDashboardAuthState,
  dashboardAuthProblems,
  dashboardFailureLimited,
  dashboardLoginMessage,
  recordDashboardFailure,
  setDashboardDealerships,
} from "../server/dashboard-auth";

const ORIGINAL_ENV = { ...process.env };
const STORES = [
  { id: 2, name: "Brian Harris BMW", domain: "brianharrisbmw.com", instagramHandle: "@brianharrisbmw" },
  { id: 3, name: "Audi Baton Rouge", domain: "audibatonrouge.com", instagramHandle: "@audibatonrouge" },
];

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  clearDashboardAuthState();
});

function usePins(json: string, admin = "") {
  setDashboardDealerships(STORES);
  if (admin) process.env.ENGINE_DASHBOARD_PASSWORD = admin;
  else delete process.env.ENGINE_DASHBOARD_PASSWORD;
  process.env.DASHBOARD_PINS_JSON = json;
  clearDashboardAuthState();
  setDashboardDealerships(STORES);
}

test("each PIN resolves to that person's name and store scope", () => {
  usePins(JSON.stringify([
    { name: "Jane Doe", pin: "48213", dealerships: ["bhbmw"] },
    { name: "Sam Lee", pin: "10001" },
  ]));

  assert.deepEqual(authenticateDashboardPin("48213"), {
    name: "Jane Doe",
    dealershipIds: [2],
  });
  assert.deepEqual(authenticateDashboardPin("10001"), {
    name: "Sam Lee",
    dealershipIds: null,
  });
  assert.equal(authenticateDashboardPin("99999"), null);
  assert.equal(dashboardLoginMessage("Jane Doe"), "Dashboard login: Jane Doe");
  assert.equal(dashboardLoginMessage("Jane Doe").includes("48213"), false);
  assert.deepEqual(dashboardAuthProblems(), []);
});

test("the shared admin PIN still opens every store", () => {
  usePins(JSON.stringify([{ name: "Jane Doe", pin: "48213", dealerships: ["Brian Harris BMW"] }]), "24680");
  assert.deepEqual(authenticateDashboardPin("24680"), { name: "admin", dealershipIds: null });
  assert.deepEqual(authenticateDashboardPin("48213")?.name, "Jane Doe");
});

test("duplicate PINs are rejected", () => {
  usePins(JSON.stringify([
    { name: "Jane Doe", pin: "48213" },
    { name: "Sam Lee", pin: "48213" },
  ]));
  assert.ok(dashboardAuthProblems().includes("DASHBOARD_PINS_JSON has a duplicate PIN"));

  usePins(JSON.stringify([{ name: "Jane Doe", pin: "48213" }]), "48213");
  assert.ok(dashboardAuthProblems().includes("DASHBOARD_PINS_JSON duplicates ENGINE_DASHBOARD_PASSWORD"));
});

test("an unknown dealership token is rejected", () => {
  usePins(JSON.stringify([{ name: "Jane Doe", pin: "48213", dealerships: ["not-a-store"] }]));
  assert.ok(dashboardAuthProblems().some((problem) => problem.includes("dealership not found: not-a-store")));
});

test("production boot requires at least one PIN source", () => {
  setDashboardDealerships(STORES);
  delete process.env.ENGINE_DASHBOARD_PASSWORD;
  delete process.env.DASHBOARD_PINS_JSON;
  process.env.NODE_ENV = "production";
  clearDashboardAuthState();
  assert.ok(dashboardAuthProblems().includes("ENGINE_DASHBOARD_PASSWORD or DASHBOARD_PINS_JSON"));
});

test("wrong PIN attempts are limited to 10 per 15 minutes per IP", () => {
  const ip = "203.0.113.10";
  for (let i = 0; i < 9; i += 1) recordDashboardFailure(ip);
  assert.equal(dashboardFailureLimited(ip), false);
  recordDashboardFailure(ip);
  assert.equal(dashboardFailureLimited(ip), true);
  assert.equal(dashboardFailureLimited("203.0.113.11"), false);
});
