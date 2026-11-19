import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSeriesFolderSource,
  customerSeriesKey,
  groupCustomerMediaSeries,
  parseFolderSource,
  resolveSeriesMediaType,
  seriesAlreadyUsed,
} from "../server/customer-series";

test("customerSeriesKey collapses frame counters and IMG tokens", () => {
  assert.equal(
    customerSeriesKey("Tarva Blum Panamera 4s E-Hybrid IMG_3354.jpeg"),
    customerSeriesKey("Tarva Blum Panamera 4s E-Hybrid IMG_3353.jpeg"),
  );
  assert.equal(
    customerSeriesKey("moe a new member of the harris porsche family 04.jpeg"),
    customerSeriesKey("moe a new member of the harris porsche family 01.jpeg"),
  );
});

test("customerSeriesKey merges Haley wording variants", () => {
  assert.equal(
    customerSeriesKey("Haley Jones another new member of the harris porsche family 02.jpeg"),
    customerSeriesKey("Haley Jones new member of the harris porsche family.mov"),
  );
});

test("groupCustomerMediaSeries builds swipe sets from HP folder names", () => {
  const files = [
    { id: "1", name: "Tarva Blum Panamera 4s E-Hybrid IMG_3354.jpeg", mimeType: "image/jpeg" },
    { id: "2", name: "Tarva Blum Panamera 4s E-Hybrid IMG_3353.jpeg", mimeType: "image/jpeg" },
    { id: "3", name: "Tarva Blum Panamera 4s E-Hybrid IMG_3345.MOV", mimeType: "video/quicktime" },
    { id: "4", name: "moe a new member of the harris porsche family 01.jpeg", mimeType: "image/jpeg" },
    { id: "5", name: "moe a new member of the harris porsche family 02.jpeg", mimeType: "image/jpeg" },
    { id: "6", name: "Haley Jones new member of the harris porsche family.mov", mimeType: "video/quicktime" },
    { id: "7", name: "Haley Jones another new member of the harris porsche family 02.jpeg", mimeType: "image/jpeg" },
  ];

  const series = groupCustomerMediaSeries(files);
  assert.equal(series.length, 3);

  const tarva = series.find((s) => s.label.toLowerCase().includes("tarva"));
  assert.ok(tarva);
  assert.equal(tarva!.files.length, 3);
  assert.equal(resolveSeriesMediaType(tarva!.files), "carousel");
  // images first, video last
  assert.ok(!/\.mov$/i.test(tarva!.files[0].name));
  assert.ok(/\.mov$/i.test(tarva!.files[tarva!.files.length - 1].name));

  const moe = series.find((s) => s.label.toLowerCase().startsWith("moe"));
  assert.ok(moe);
  assert.equal(moe!.files.length, 2);
  assert.equal(resolveSeriesMediaType(moe!.files), "carousel");

  const haley = series.find((s) => s.label.toLowerCase().includes("haley"));
  assert.ok(haley);
  assert.equal(haley!.files.length, 2);
  assert.equal(resolveSeriesMediaType(haley!.files), "carousel");
});

test("folderSource series round-trip and used detection", () => {
  const folderId = "FOLDER";
  const series = groupCustomerMediaSeries([
    { id: "a", name: "moe a new member of the harris porsche family 01.jpeg", mimeType: "image/jpeg" },
    { id: "b", name: "moe a new member of the harris porsche family 02.jpeg", mimeType: "image/jpeg" },
  ])[0];

  const source = buildSeriesFolderSource(folderId, series.key, series.files.map((f) => f.id));
  const parsed = parseFolderSource(source);
  assert.equal(parsed.kind, "series");
  assert.deepEqual(parsed.fileIds, ["a", "b"]);

  const used = new Set<string>([source]);
  assert.equal(seriesAlreadyUsed(folderId, series, used), true);

  const usedByMember = new Set<string>([`${folderId}/a`]);
  assert.equal(seriesAlreadyUsed(folderId, series, usedByMember), true);

  assert.equal(seriesAlreadyUsed(folderId, series, new Set()), false);
});

test("single image series stays image media type", () => {
  const files = [{ id: "1", name: "solo delivery.jpg", mimeType: "image/jpeg" }];
  assert.equal(resolveSeriesMediaType(files), "image");
});
