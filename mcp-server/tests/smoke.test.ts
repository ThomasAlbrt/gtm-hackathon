import { expect, it } from "vitest";

import { slugify } from "../src/contacts.js";

it("slugify keeps the shared contract", () => {
  expect(slugify("Éloïse")).toMatch(/^eloise-[a-z0-9]{4}$/);
});
