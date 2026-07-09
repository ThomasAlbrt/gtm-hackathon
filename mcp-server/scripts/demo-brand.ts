import "../src/env.js";

import { resolveBrand } from "../src/brand.js";

const kit = await resolveBrand(process.argv[2] ?? "");

if (kit) {
  console.log(JSON.stringify(kit, null, 2));
} else {
  console.log("resolution failed (missing key / API error)");
}
