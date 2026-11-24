#!/usr/bin/env node
/** Unit tests for Campaign Types' import and export (Nov 2026, phase 3): a type's CSV columns, its cells, read back. */
import { campaignCells, campaignCsv, campaignHeadings, customCell, customFromCell } from "../../src/lib/campaign-csv.js";
import { EXPORT_HEADERS, exportCells } from "../../src/lib/lead-export.js";
import { parseCsv, rowsToImport } from "../../src/lib/csv.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

const insurance = campaignCsv(null);
check("Insurance: the template as it is", JSON.stringify(insurance.columns.map((c) => c.heading)) === JSON.stringify(EXPORT_HEADERS) && !Object.keys(insurance.aliases).length);
const r = { lead: { company_name: "Acme", xmod: 0.9, custom: { d: 42 } }, insurance: { ultimate_xdate: "2027-04-01" } };
check("…its cells exportCells'", JSON.stringify(campaignCells(insurance, r)) === JSON.stringify(exportCells(r)));

const share = { id: "s", label: "Managed share", type: "percent" };
const tools = { id: "t", label: "Platforms", type: "multi", options: ["Microsoft 365", "Google, Workspace", "Zoom"] };
const desks = { id: "d", label: "Desktops", type: "number" };
const live = { id: "l", label: "Go-live", type: "date" };
const msp = { id: "m", label: "Has MSP", type: "yesno" };
const host = { id: "h", label: "Hosting", type: "select", options: ["Azure", "AWS"] };
const type = { name: "IT", fields: {
  builtin: { ultimate_xdate: { label: "Contract renewal" }, xmod: { hidden: true }, autos: { hidden: true }, tab_coverage: { label: "Systems" }, line_wc: { hidden: true } },
  custom: [desks, share, tools, live, msp, host],
} };
const it = campaignCsv(type);
const heads = campaignHeadings(type);
check("a type: the key date renamed", heads.includes("Contract renewal") && !heads.includes("Ultimate XDate"));
check("…the parts it turns off left out (XMOD; Autos, Drivers, Vehicle Types, Travel Radius; Work Comp)",
  !["XMOD", "Autos", "Drivers", "Vehicle Types", "Travel Radius", "Work Comp XDate", "Work Comp Carrier"].some((h) => heads.includes(h)) && heads.includes("Package XDate"));
check("…its own fields at the end", JSON.stringify(heads.slice(-6)) === JSON.stringify(["Desktops", "Managed share", "Platforms", "Go-live", "Has MSP", "Hosting"]), heads.slice(-6).join("|"));
check("…a field named like a column kept apart", campaignHeadings({ name: "X", fields: { custom: [{ id: "e", label: "Employees", type: "number" }] } }).includes("Employees (2)"));
const coverageOff = campaignHeadings({ name: "Y", fields: { builtin: { tab_coverage: { hidden: true } }, custom: [] } });
check("the coverage tab off: its columns too", !coverageOff.includes("Ultimate XDate") && !coverageOff.includes("Agency Name") && !coverageOff.includes("Package Carrier") && coverageOff.includes("SIC Code"));

const row = { lead: { company_name: "Acme", custom: { d: 42, s: 12.5, t: ["Google, Workspace", "Zoom"], l: "2027-01-05", m: true, h: "AWS" } }, insurance: { ultimate_xdate: "2027-04-01" } };
const cells = campaignCells(it, row);
const cell = (h) => cells[heads.indexOf(h)];
check("its cells: the renamed date under its new name", cell("Contract renewal") === "4/1/2027" && cell("Company") === "Acme");
check("…its answers as a list writes them", cell("Desktops") === "42" && cell("Managed share") === "12.5%" && cell("Platforms") === "Google, Workspace; Zoom"
  && cell("Go-live") === "1/5/2027" && cell("Has MSP") === "Yes" && cell("Hosting") === "AWS", JSON.stringify(cells.slice(-6)));

// Read back: the export's own file.
const csv = `${heads.map((h) => (/[",]/.test(h) ? `"${h}"` : h)).join(",")}\n${cells.map((c) => (/[",]/.test(String(c)) ? `"${c}"` : c)).join(",")}\n`;
const back = rowsToImport(parseCsv(csv), it.aliases).rows[0];
check("read back: the renamed date into the Ultimate XDate", back?.insurance?.ultimate_xdate === "2027-04-01", JSON.stringify(back?.insurance));
check("…its answers, each by kind", JSON.stringify(back?.custom) === JSON.stringify(row.lead.custom), JSON.stringify(back?.custom));
check("an Insurance import ignores them", !rowsToImport(parseCsv(csv)).rows[0]?.custom);

check("cells read by kind, whatever the case", customFromCell(host, "aws") === "AWS" && customFromCell(host, "GCP") === null && customFromCell(msp, "n") === false
  && customFromCell(share, "7 %") === 7 && customFromCell(desks, "lots") === null && customFromCell(live, "2027-02-03") === "2027-02-03");
check("several: by ; | or new line, or commas when that's how they read", JSON.stringify(customFromCell(tools, "zoom|microsoft 365")) === '["Zoom","Microsoft 365"]'
  && JSON.stringify(customFromCell(tools, "Zoom, Microsoft 365")) === '["Zoom","Microsoft 365"]' && JSON.stringify(customFromCell(tools, "Google, Workspace")) === '["Google, Workspace"]');
check("blank: blank", customCell(desks, null) === "" && customFromCell(desks, "  ") === null);

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log("\ncampaign csv: all passed");
