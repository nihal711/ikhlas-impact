import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { wipeAndImportClusters } from "./db.js";

const csvPathArg = process.argv[2];

if (!csvPathArg) {
  console.error("Usage: npm run import:csv -- ./imports/houses.csv");
  process.exit(1);
}

const csvPath = path.resolve(process.cwd(), csvPathArg);
if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found: ${csvPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(csvPath, "utf8");
const records = parse(raw, {
  columns: true,
  skip_empty_lines: true,
  trim: true
});

const normalized = records.map((row, index) => {
  const cluster = row.cluster ?? row.Cluster;
  const houseId = row.house_id ?? row.houseId ?? row.HouseID ?? row.house;
  const address = row.address ?? row.Address;

  if (!cluster || !houseId || !address) {
    throw new Error(
      `Invalid row ${index + 2}. Required columns: cluster, house_id, address`
    );
  }

  return {
    cluster: String(cluster),
    houseId: String(houseId),
    address: String(address)
  };
});

const distinctClusters = new Set(normalized.map((row) => row.cluster.trim()));
if (distinctClusters.size < 1) {
  console.error(`No clusters found in CSV. Please fix CSV before import.`);
  process.exit(1);
}

wipeAndImportClusters(normalized);

console.log(
  `Imported ${normalized.length} houses across ${distinctClusters.size} clusters from ${csvPathArg}`
);
