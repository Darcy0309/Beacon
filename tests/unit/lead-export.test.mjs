#!/usr/bin/env node
/** Unit tests for a project's export: the import template's columns, read back by the import the same. */
import { TEMPLATE_HEADERS, mapAllHeaders, parseCsv, rowsToImport } from "../../src/lib/csv.js";
import { EXPORT_HEADERS, csvCell, csvLine, currentAppointment, exportCells, exportFileName } from "../../src/lib/lead-export.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const is = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

check("the export's columns start with the import template's, in its order", JSON.stringify(EXPORT_HEADERS.slice(0, TEMPLATE_HEADERS.length)) === JSON.stringify(TEMPLATE_HEADERS));
check("…and every one is a heading the import reads", mapAllHeaders(EXPORT_HEADERS).every(Boolean), EXPORT_HEADERS.filter((_, i) => !mapAllHeaders(EXPORT_HEADERS)[i]).join(", "));

const lead = {
  company_name: "Parkview Car Wash, LLC", contact_name: "Sean", contact_title: "Owner", phone: "480-823-1986", contact_mobile: "+1 714-401-2975", email: "sean@parkview.example",
  fax: "480-823-1987", website: "parkviewwash.example", decision_maker: "Dana \"DJ\" Jones", dm_title: "GM", dm_phone: "480-823-1990", dm_mobile: "480-823-1991", dm_email: "dana@parkview.example",
  contact2_name: "Lee", contact2_title: "Bookkeeper", contact2_phone: "480-823-1992", contact2_mobile: "480-823-1993", contact2_email: "lee@parkview.example",
  address: "16827 E Parkview Ave", city: "Fountain Hills", state: "AZ", zip: "85268", county: "Maricopa", territory: "East Valley",
  sic_code: "7542", description: "Two tunnels", employees: "14", autos: "3", drivers: 4, xmod: 1.5, sales_volume: "$2.1M", location: "2", ein: "98-7654321", years_in_business: "12", estimated_annual_premium: "18000",
  producer_name: "Jeff McDonald", list_source: "IPA-CarWash_MaricopaAZ_June2026", call_result_dbdv: "Lead", call_result_appt: "Lead-No Contact",
  client_note: "Appt set with Sean.\nBring the loss runs.",
};
const insurance = { agency_name: "Garry Insurance", agency_years: 5, ultimate_xdate: "2027-03-01", pkg_xdate: "2027-03-01", pkg_carrier: "Travelers", wc_xdate: "2027-08-17", wc_carrier: "CopperPoint",
  auto_xdate: "2027-12-09", auto_carrier: "Progressive", health_xdate: null, health_carrier: null, eo_xdate: "2027-01-05", eo_carrier: "Hiscox" };
const row = { lead, insurance, note: "-10/9/26 mike: left vm\n10/12/26 mike: set appt", result: { name: "Appointment-Phone", project_type: "APPT" },
  appointment: { appt_date: "2026-10-20", appt_time: "10:00 AM" }, sicDescription: "Car washes" };

const cells = exportCells(row);
const at = (h) => cells[EXPORT_HEADERS.indexOf(h)];
check("Drivers and XMOD sit after Autos, before Sales Volume, the XMOD to two places",
  EXPORT_HEADERS.indexOf("Drivers") === EXPORT_HEADERS.indexOf("Autos") + 1 && EXPORT_HEADERS.indexOf("XMOD") === EXPORT_HEADERS.indexOf("Drivers") + 1
    && EXPORT_HEADERS.indexOf("Sales Volume") === EXPORT_HEADERS.indexOf("XMOD") + 1 && at("Drivers") === 4 && at("XMOD") === "1.50", `${at("Drivers")} ${at("XMOD")}`);
check("one value for each column", cells.length === EXPORT_HEADERS.length);
check("dates are written as the lists write them", at("Ultimate XDate") === "3/1/2027" && at("Work Comp XDate") === "8/17/2027" && at("Appointment Date") === "10/20/2026" && at("Health XDate") === "");
check("the call result is where the lead stands now; the other column keeps what it had", at("Call Result Appt") === "Appointment-Phone" && at("Call Result DBDV") === "Lead");
check("…on a DB dev project, the other way round", exportCells({ ...row, result: { name: "Viable-CallBack", project_type: "DBDV" } })[EXPORT_HEADERS.indexOf("Call Result DBDV")] === "Viable-CallBack");
check("the SIC description, the notes for the client and the internal ones", at("SIC Description") === "Car washes" && at("Notes") === lead.client_note && at("Internal Notes") === row.note);
check("a lead with nothing else is its company and blanks", exportCells({ lead: { company_name: "Bare Co" } }).filter(Boolean).join("|") === "Bare Co");

is("a value with a comma, a quote or a new line is quoted", [csvCell("a,b"), csvCell('say "hi"'), csvCell("one\ntwo"), csvCell("plain"), csvCell(null), csvCell(0)], ['"a,b"', '"say ""hi"""', '"one\ntwo"', "plain", "", "0"]);
is("one that would open as a formula is kept as text", [csvCell("=1+1"), csvCell("+1 714-401-2975"), csvCell("-note"), csvCell("@handle")], ["'=1+1", "'+1 714-401-2975", "'-note", "'@handle"]);

// The file, read by the import.
const file = `﻿${csvLine(EXPORT_HEADERS)}\r\n${csvLine(cells)}\r\n${csvLine(exportCells({ lead: { company_name: "Bare Co" } }))}\r\n`;
const back = rowsToImport(parseCsv(file));
check("the import reads every row of an export", back.rows.length === 2 && back.errors === 0, JSON.stringify(back.errors));
const got = back.rows[0];
const { sic_description: sicBack, ...leadBack } = got.lead;
is("…the lead comes back as it was, on the result it has now", Object.fromEntries(Object.keys(lead).map((k) => [k, leadBack[k]])), { ...lead, call_result_appt: "Appointment-Phone" });
check("…with nothing the lead did not have", Object.keys(leadBack).every((k) => k in lead), Object.keys(leadBack).filter((k) => !(k in lead)).join(", "));
check("…its SIC description beside its code", sicBack === "Car washes");
is("…its coverage", Object.fromEntries(Object.keys(insurance).filter((k) => insurance[k] != null).map((k) => [k, got.insurance[k]])), Object.fromEntries(Object.entries(insurance).filter(([, v]) => v != null)));
check("…and no policy it did not have", Object.keys(got.insurance).every((k) => insurance[k] != null));
is("…its appointment", got.appointment, { appt_date: "2026-10-20", appt_time: "10:00 AM" });
is("…its internal notes, the leading dash and all", got.notes, { internal_notes: row.note });
is("…and a bare lead as a bare lead", back.rows[1], { lead: { company_name: "Bare Co" }, insurance: null, notes: null, appointment: null, status: back.rows[1].status });

const appts = [{ id: 1, appt_create_date: "2026-10-01T10:00:00Z", invalid_at: null }, { id: 2, appt_create_date: "2026-10-05T10:00:00Z", invalid_at: "2026-10-06T10:00:00Z" },
  { id: 3, appt_create_date: "2026-10-03T10:00:00Z", invalid_at: null }, { id: 4, appt_create_date: "2026-10-03T10:00:00Z", invalid_at: null }];
check("a lead's appointment is the latest made that is not invalid", currentAppointment(appts)?.id === 4 && currentAppointment([appts[1]]) === null && currentAppointment(null) === null);

is("the file is named for the project and the day", [exportFileName("CapitalIns-InsPros-Maricopa_2026_DBDev", "2026-10-13"), exportFileName('A & B "Churches" / AZ', "2026-10-13"), exportFileName("", "2026-10-13")],
  ["CapitalIns-InsPros-Maricopa_2026_DBDev_2026-10-13.csv", "A_B_Churches_AZ_2026-10-13.csv", "project_2026-10-13.csv"]);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll lead export checks passed.");
