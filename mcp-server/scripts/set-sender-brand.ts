import "../src/env.js";

import { ensureSenderBrand } from "../src/brand.js";

const kit = await ensureSenderBrand(process.argv[2]);

if (kit) {
  const { fontLinks, ...rest } = kit;
  console.log(JSON.stringify({ ...rest, fontLinks: fontLinks?.length }, null, 2));
} else {
  console.error("resolution failed (missing key / API error)");
  process.exit(1);
}
