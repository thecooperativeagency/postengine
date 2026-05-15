import { test } from "node:test";
import * as assert from "node:assert/strict";

import {
  EMAIL_ITERATION_REFERENCE_ROOT,
  buildSeededEmailIterationDefinitions,
} from "../server/email-iteration-config";

test("buildSeededEmailIterationDefinitions returns the expected seeded monthly iterator cards", () => {
  const definitions = buildSeededEmailIterationDefinitions();

  assert.equal(definitions.length, 8);

  const byKey = new Map(definitions.map((definition) => [`${definition.dealershipName}:${definition.campaignKey}`, definition]));

  assert.equal(definitions.filter((definition) => definition.status === "active-now").length, 6);
  assert.equal(definitions.filter((definition) => definition.status === "later").length, 2);

  assert.equal(
    byKey.get("BMW of Jackson:sales-monthly")?.latestBaseEmailReferenceFile,
    `${EMAIL_ITERATION_REFERENCE_ROOT}/BMW of Jackson/Sales/bmw-jackson-may-2026-email.html`,
  );

  assert.deepEqual(
    byKey.get("Audi Baton Rouge:sales-monthly")?.priorReferenceFiles,
    [
      `${EMAIL_ITERATION_REFERENCE_ROOT}/Audi Baton Rouge/Sales/abr-april-2026-sales-email.html`,
      `${EMAIL_ITERATION_REFERENCE_ROOT}/Audi Baton Rouge/Sales/abr-may-2026-loyalty-email.html`,
    ],
  );

  assert.equal(
    byKey.get("Brian Harris BMW:service-monthly")?.status,
    "later",
  );
  assert.equal(
    byKey.get("BMW of Jackson:service-monthly")?.latestBaseEmailReferenceFile,
    null,
  );
  assert.equal(
    byKey.get("Harris Porsche:service-monthly")?.latestBaseEmailReferenceFile,
    `${EMAIL_ITERATION_REFERENCE_ROOT}/Harris Porsche/Service/harris-porsche-birthday-email.html`,
  );
});
