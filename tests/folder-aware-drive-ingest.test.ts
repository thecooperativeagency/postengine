import assert from "node:assert/strict";
import test from "node:test";

import {
  inferModelKeyFromText,
  isGenericMediaName,
  buildContextLabel,
} from "../server/asset-classifier";
import { parseFileName, resolveVehicleInfo } from "../server/drive-scanner";

test("isGenericMediaName catches camera dumps and keeps descriptive names", () => {
  assert.equal(isGenericMediaName("_33A9369.JPG"), true);
  assert.equal(isGenericMediaName("33A9102.JPG"), true);
  assert.equal(isGenericMediaName("IMG_1234.jpg"), true);
  assert.equal(isGenericMediaName("copy_2C920E65-5FAE-4CF0-B2B9-8FEDA981C722.mov"), true);
  assert.equal(isGenericMediaName("2026 bmw x3 forest hero.jpeg"), false);
  assert.equal(isGenericMediaName("Porsche Taycan_33A7860.JPG"), false);
});

test("inferModelKeyFromText reads folder-style BMW labels", () => {
  assert.equal(inferModelKeyFromText("BMW x3"), "x3");
  assert.equal(inferModelKeyFromText("BMW x2"), "x2");
  assert.equal(inferModelKeyFromText("BMW alpina"), "alpina");
  assert.equal(inferModelKeyFromText("BMW 530i"), "530");
  assert.equal(inferModelKeyFromText("2026 BMW X5 M"), "x5m");
  assert.equal(inferModelKeyFromText("2026 Audi S3"), "s3");
});

test("resolveVehicleInfo prefers filename when descriptive", () => {
  const result = resolveVehicleInfo("2026 bmw m4 competition.jpg", "BMW x3");
  assert.equal(result.identitySource, "filename");
  assert.match(result.vehicleInfo.toLowerCase(), /m4/);
});

test("resolveVehicleInfo uses folder name for camera-dump files", () => {
  const result = resolveVehicleInfo("_33A9369.JPG", "BMW x3", "BMW x3");
  assert.equal(result.identitySource, "folder");
  assert.match(result.vehicleInfo.toLowerCase(), /bmw/);
  assert.match(result.vehicleInfo.toLowerCase(), /x3/);
  assert.equal(inferModelKeyFromText(result.vehicleInfo), "x3");
});

test("resolveVehicleInfo uses alpina / 530i / x2 folder names", () => {
  assert.equal(
    inferModelKeyFromText(resolveVehicleInfo("_33A8980.JPG", "BMW alpina").vehicleInfo),
    "alpina",
  );
  assert.equal(
    inferModelKeyFromText(resolveVehicleInfo("_33A9062.JPG", "BMW 530i").vehicleInfo),
    "530",
  );
  assert.equal(
    inferModelKeyFromText(resolveVehicleInfo("_33A9370.JPG", "BMW x2").vehicleInfo),
    "x2",
  );
});

test("parseFileName cleans folder-like labels", () => {
  assert.equal(parseFileName("BMW x3 "), "BMW x3");
  assert.equal(parseFileName("some-car_name.jpg"), "some car name");
});

test("buildContextLabel prefers folderPath over folderName", () => {
  assert.equal(buildContextLabel({ folderName: "X3", folderPath: "SUV/X3" }), "SUV/X3");
  assert.equal(buildContextLabel({ folderName: "BMW x3", folderPath: null }), "BMW x3");
  assert.equal(buildContextLabel({ folderName: null, folderPath: "" }), "");
});
