#!/usr/bin/env node
/** Unit tests for Campaign Types (Nov 2026): a type's fields made safe, a lead sheet's labels, and answers read. */
import { campaignView, cleanFields, customFromForm, customText } from "../../src/lib/campaign-types.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

const ins = campaignView(null);
check("no type: Insurance, its own names, nothing off", ins.insurance && ins.name === "Insurance" && ins.label("ultimate_xdate") === "Ultimate XDate" && !ins.hidden("xmod") && ins.custom.length === 0);

const { fields } = cleanFields({
  builtin: { ultimate_xdate: { label: "Contract renewal" }, xmod: { hidden: true }, tab_business: { hidden: true, label: "Company" }, nonsense: { label: "x" }, ein: { label: "EIN" } },
  custom: [{ label: "Desktops", type: "number" }, { label: "Cloud", type: "select", options: "Azure, AWS, Azure" }, { label: "", type: "text" }],
});
check("a renamed key date and a field turned off are kept; an unknown key, and a name the same as the default, are not",
  JSON.stringify(Object.keys(fields.builtin).sort()) === JSON.stringify(["tab_business", "ultimate_xdate", "xmod"]), JSON.stringify(fields.builtin));
check("…the Business tab can be renamed but never turned off", fields.builtin.tab_business.label === "Company" && !fields.builtin.tab_business.hidden);
check("its own fields: named ones only, each with an id; a list's choices once each",
  fields.custom.length === 2 && fields.custom.every((c) => c.id) && JSON.stringify(fields.custom[1].options) === JSON.stringify(["Azure", "AWS"]));
check("a list with no choices, or a field of no kind, is refused", Boolean(cleanFields({ custom: [{ label: "Cloud", type: "select" }] }).error) && Boolean(cleanFields({ custom: [{ label: "X", type: "nope" }] }).error));

const it = campaignView({ name: "IT / MSP", fields });
check("a type's view: its names, its fields off, its own fields", it.label("ultimate_xdate") === "Contract renewal" && it.hidden("xmod") && !it.hidden("ein") && it.custom.length === 2 && it.name === "IT / MSP");

const [desk, cloud] = fields.custom;
const yes = { id: "y", label: "In-house IT", type: "yesno" };
const read = customFromForm([desk, cloud, yes], form({ [`custom.${desk.id}`]: "1,250", [`custom.${cloud.id}`]: "AWS", "custom.y": "no" }));
check("answers read by kind: a number, a choice, Yes/No", read.values[desk.id] === 1250 && read.values[cloud.id] === "AWS" && read.values.y === false, JSON.stringify(read));
check("…a choice not on its list, or a number that isn't one, refused",
  Boolean(customFromForm([cloud], form({ [`custom.${cloud.id}`]: "Oracle" })).error) && Boolean(customFromForm([desk], form({ [`custom.${desk.id}`]: "lots" })).error));
check("…blank clears it; a field not on the form left alone", customFromForm([desk, cloud], form({ [`custom.${desk.id}`]: "" })).values[desk.id] === null
  && !(cloud.id in customFromForm([desk, cloud], form({ [`custom.${desk.id}`]: "" })).values));
check("an answer as the sheet says it", customText(yes, true) === "Yes" && customText(desk, 1250) === "1,250" && customText(desk, null) === null);

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log("\ncampaign types: all passed");
