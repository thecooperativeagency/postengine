import test from "node:test";
import assert from "node:assert/strict";
import { readSectionOpen, sectionMemoryKey, writeSectionOpen } from "../client/src/lib/section-memory";

test("sections stay closed until this user opens them", () => {
  assert.equal(readSectionOpen(null, "scan-controls"), false);
  assert.equal(readSectionOpen("{", "scan-controls"), false);
  const saved = writeSectionOpen(null, "scan-controls", true);
  assert.equal(readSectionOpen(saved, "scan-controls"), true);
  assert.equal(readSectionOpen(saved, "activity"), false);
});

test("closing a section forgets it and leaves the other user's key alone", () => {
  const open = writeSectionOpen(null, "publishing", true);
  const both = writeSectionOpen(open, "rewrite-4", true);
  const closed = writeSectionOpen(both, "publishing", false);
  assert.equal(readSectionOpen(closed, "publishing"), false);
  assert.equal(readSectionOpen(closed, "rewrite-4"), true);
  assert.equal(sectionMemoryKey("Ada"), "pe-sections:Ada");
  assert.notEqual(sectionMemoryKey("Ada"), sectionMemoryKey("Lance"));
  assert.equal(sectionMemoryKey("  "), "pe-sections:owner");
});
