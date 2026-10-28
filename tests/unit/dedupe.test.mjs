#!/usr/bin/env node
/**
 * Duplicates in a bought list and names a client took off before (Oct 2026),
 * on rows from the client's own SalesGenie sample (Northeast Wisconsin).
 */
import { parseCsv, rowsToImport, mapAllHeaders } from "../../src/lib/csv.js";
import { findDuplicates, keepScore, nameKey, phoneKey, einKey, removalMatcher } from "../../src/lib/dedupe.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
};
const eq = (label, actual, expected) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

const HEAD = "Company Name,Phone Number Combined,Executive First Name,Executive Last Name,Executive Title,Location Address,Location City,Location State,Location ZIP Code,Fax Number Combined,County Description,Company Website,Location Employee Size Actual,Location Sales Volume Range,Primary SIC Code,Primary SIC Code Description,Own or Lease,EIN 1,First Name 1,Last Name 1,Executive Title 1,Executive Gender 1,First Name 2,Last Name 2,Executive Title 2";
const SAMPLE = [
  HEAD,
  `41 Auto Stop Inc,(920) 834-2011,Jeffrey L,Hoover,Manager,854 Brazeau Ave,Oconto,WI,54153,(920) 834-3665,Oconto,http://41autostop.Com,17,$1-2.5 Million,7538-01,Automobile Repairing & Service,Unknown,,Kathy,Hoover,Treasurer,Female,Kathy,Hoover,Operations`,
  `AC Asphalt Specialists,(920) 499-2220,,,,6592 Old Highway 29,Seymour,WI,54165,Not Available,Outagamie,http://Greenbayasphaltrepair.Com,4,"Less Than $500,000",1771-18,Asphalt Paving Contractors,Unknown,,,,,,,,`,
  `AC Asphalt Specialists,(920) 865-7279,Tom,Snyder,Owner,6592 Old Wisconsin 29,Seymour,WI,54165,(920) 865-7493,Outagamie,http://Greenbayasphaltrepair.Com,15,$2.5-5 Million,1611-01,Paving Contractors,Unknown,,Thomas,Snider,Owner,Male,Tom,Snider,Manager`,
  `Acculevel,(920) 710-6078,,,,444 Reid St # 301,De Pere,WI,54115,Not Available,Brown,http://Acculevel.Com,7,"$500,000-1 Million",1741-01,Masonry Contractors,Lease,,,,,,,,`,
  `Acculevel,(920) 310-3150,,,,2149 Velp Ave # 102,Green Bay,WI,54303,Not Available,Brown,http://Acculevel.Com,7,"$500,000-1 Million",1741-01,Masonry Contractors,Lease,,,,,,,,`,
  `Accurate Full-Svc Vehicle Ctr,(920) 731-5442,Mark,Broehm,Owner,3020 W Franklin St,Appleton,WI,54914,(920) 731-5042,Outagamie,http://Accuratealignment.Com,38,$5-10 Million,5013-14,Automobile Repair/Svc-Equip/Supl (Whls),Own,391178301,Dennis,Broehm,Manager,Male,Tom,Acord,Finance Exec`,
  `Accurate Suspension Warehouse,(920) 738-7278,Mark,Broehm,Owner,3020 W Franklin St,Appleton,WI,54914,Not Available,Outagamie,http://Takeittoaccurate.Com,10,$1-2.5 Million,5531-11,Automobile Parts & Supplies-Retail-New,Own,,Dennis,Broehm,HR Executive,Male,Paul,Summ,Sales Exec`,
  `Advanced Home Technologies Inc,(920) 831-0682,Tom,Meeserman,Manager,1873 N Casaloma Dr,Appleton,WI,54913,Not Available,Outagamie,,10,$2.5-5 Million,5211-07,Windows,Own,,,,,,,,`,
  `Affordable Sewer & Drain Inc,(920) 490-4522,,,,1281 Lear Ln # 15,De Pere,WI,54115,Not Available,Brown,,5,"$500,000-1 Million",7699-02,Plumbing Drain & Sewer Cleaning,Unknown,,,,,,,,`,
  `Affordable Sewer-Drain Clnng,(920) 490-4522,Patrick,Clemens,Owner,14470 Wildwood Ln,Lakewood,WI,54138,Not Available,Oconto,http://Affordablejettingmn.Com,6,"$500,000-1 Million",1711-52,Sewer & Drain Cleaning-Service/Repair,Unknown,,,,,,,,`,
  `Aht Windows,(800) 387-9450,Tom,Young,Owner,71 S Main St,Clintonville,WI,54929,(608) 838-0603,Waupaca,http://Ahtwindows.Com,20,$5-10 Million,5211-07,Windows,Unknown,203467404,Sue,Leiser,Manager,Female,R Young,Scott,Manager`,
  `Aht Wisconsin Windows,(920) 831-0682,Tom,Meersman,Manager,3962 N Richmond St # A,Appleton,WI,54913,Not Available,Outagamie,http://Ahtwindows.Com,8,$2.5-5 Million,5211-07,Windows,Unknown,,,,,,,,`,
  `AHT Wisconsin Windows,(715) 823-2125,Tom,Meersman,President,71 S Main St,Clintonville,WI,54929,(715) 823-5614,Waupaca,http://Ahtwindows.Com,30,$10-20 Million,5211-07,Windows,Own,,Mary,Wahl,Manager,Female,Kira,Bronowski,Marketing Exec`,
  `Al Dix Concrete Inc,(920) 766-4344,Allan,Dix,Owner,401 Gertrude St,Kaukauna,WI,54130,(920) 766-4866,Outagamie,http://Aldixconcrete.Com,13,"Less Than $500,000",1771-05,Concrete Contractors,Lease,,Dylan,Marx,Manager,Male,Travis,Haen,Other`,
  `Al Dix Concrete Inc,(920) 766-4344,Michael,Dix,Manager,W4437 Schmidt Rd,Kaukauna,WI,54130,Not Available,Calumet,http://Aldixconcrete.Com,6,"$500,000-1 Million",1771-05,Concrete Contractors,Unknown,,,,,,,,`,
  `Aldo's Pizza,(920) 499-5449,Tim,Cleary,Owner,1247 Velp Ave,Green Bay,WI,54303,Not Available,Brown,,7,"Less Than $500,000",5812-22,Pizza,Unknown,,,,,,,,`,
  `Subway,(920) 555-0101,Ann,Lee,Owner,1 Main St,Oshkosh,WI,54901,Not Available,Winnebago,,8,"Less Than $500,000",5812-08,Restaurants,Unknown,,,,,,,,`,
  `Subway,(920) 555-0202,Bob,Kerr,Owner,9 Oak St,Neenah,WI,54956,Not Available,Winnebago,,8,"Less Than $500,000",5812-08,Restaurants,Unknown,,,,,,,,`,
].join("\n");

// --- SalesGenie columns ----------------------------------------------------
const csv = parseCsv(SAMPLE);
const unread = mapAllHeaders(csv[0]).map((m, i) => (m ? null : csv[0][i])).filter(Boolean);
eq("every SalesGenie column used is read, but Own or Lease and the genders", unread, ["Own or Lease", "Executive Gender 1"]);

const { rows, errors } = rowsToImport(csv);
check("every row imports", rows.length === 18 && errors === 0, `${rows.length} / ${errors}`);
const stop = rows[0];
eq("the location's address, phone, fax, county and website", [stop.lead.address, stop.lead.city, stop.lead.state, stop.lead.zip, stop.lead.phone, stop.lead.fax, stop.lead.county, stop.lead.website],
  ["854 Brazeau Ave", "Oconto", "WI", "54153", "(920) 834-2011", "(920) 834-3665", "Oconto", "http://41autostop.Com"]);
eq("the executive is the contact, first and last name together", [stop.lead.contact_name, stop.lead.contact_title], ["Jeffrey L Hoover", "Manager"]);
eq("Name 1 is the second contact", [stop.lead.contact2_name, stop.lead.contact2_title], ["Kathy Hoover", "Treasurer"]);
eq("Name 2 is kept in the internal notes", stop.notes?.internal_notes, "Other contact: Kathy Hoover, Operations");
eq("employees, sales volume and the SIC", [stop.lead.employees, stop.lead.sales_volume, stop.lead.sic_code, stop.lead.sic_description],
  ["17", "$1-2.5 Million", "7538-01", "Automobile Repairing & Service"]);
eq("Not Available is blank", rows[1].lead.fax, undefined);
eq("the EIN", rows[5].lead.ein, "39-1178301");
check("one person named twice counts once", stop.contacts === 2, stop.contacts);
check("three people, three contacts", rows[2].contacts === 3, rows[2].contacts);
eq("each row knows its row in the file", rows.map((r) => r.row).slice(0, 3), [1, 2, 3]);

const raw = parseCsv("Company Name,Mailing Address,Mailing City,Location Address,Location City,Location Sales Volume Actual,Location Sales Volume Range,First Name 0\nA G Mechanical LLC,PO Box 804,Neenah,330 Milwaukee St,Menasha,\"$867,000 \",\"$500,000-1 Million\",Andy");
const ag = rowsToImport(raw).rows[0].lead;
eq("the raw file: the location, not the mailing address; the range, not the actual", [ag.address, ag.city, ag.sales_volume, ag.contact_name], ["330 Milwaukee St", "Menasha", "$500,000-1 Million", undefined]);
eq("a Contact column wins over first and last names", rowsToImport(parseCsv("Company,Contact,First Name,Last Name\nAcme,Pat Doe,Jo,Roe")).rows[0].lead.contact_name, "Pat Doe");

// --- keys ------------------------------------------------------------------
eq("names compared without Inc, LLC, case or punctuation", [nameKey("AHT Wisconsin Windows"), nameKey("Aht Wisconsin Windows Inc"), nameKey("Abts Bou-Matic"), nameKey("Abtsbou-Matic")],
  ["ahtwisconsinwindows", "ahtwisconsinwindows", "abtsboumatic", "abtsboumatic"]);
eq("a name that is only a suffix is kept", nameKey("Inc"), "inc");
eq("phones by their ten digits", [phoneKey("(920) 766-4344"), phoneKey("1-920-766-4344"), phoneKey("766-4344")], ["9207664344", "9207664344", null]);
eq("EINs by their nine digits", [einKey("39-1178301"), einKey("91178301"), einKey("123")], ["391178301", "091178301", null]);

// --- duplicates ------------------------------------------------------------
const groups = findDuplicates(rows);
const named = groups.map((g) => g.rows.map((i) => `${rows[i].lead.company_name}@${rows[i].lead.city}`));
const has = (...members) => named.some((g) => members.every((m) => g.includes(m)) && g.length === members.length);
check("the same name, one site, no contact: one business", has("AC Asphalt Specialists@Seymour", "AC Asphalt Specialists@Seymour"), JSON.stringify(named));
check("two offices of one business with no people named: one group", has("Acculevel@De Pere", "Acculevel@Green Bay"));
check("one owner at one address under two names: one group", has("Accurate Full-Svc Vehicle Ctr@Appleton", "Accurate Suspension Warehouse@Appleton"));
check("the same phone under two names: one group", has("Affordable Sewer & Drain Inc@De Pere", "Affordable Sewer-Drain Clnng@Lakewood"));
check("the same phone at two addresses: one group", has("Al Dix Concrete Inc@Kaukauna", "Al Dix Concrete Inc@Kaukauna"));
check("AHT: one manager's two offices and the same phone under another name, one group",
  has("Advanced Home Technologies Inc@Appleton", "Aht Wisconsin Windows@Appleton", "AHT Wisconsin Windows@Clintonville"));
check("…but another name with other people and another phone is not joined by its street address alone", !named.some((g) => g.includes("Aht Windows@Clintonville")));
check("one name, other owners, another city: two businesses", !named.some((g) => g.some((m) => m.startsWith("Subway@"))));
check("a business alone is in no group", !named.some((g) => g.some((m) => m.startsWith("41 Auto Stop") || m.startsWith("Aldo's"))));
check("six groups", groups.length === 6, groups.length);
const leftOff = groups.reduce((s, g) => s + g.rows.length - 1, 0);
check("seven records left off", leftOff === 7, leftOff);

const keepOf = (name) => rows[groups.find((g) => g.rows.some((i) => rows[i].lead.company_name === name)).keep];
eq("kept: the record with the FEIN", keepOf("Accurate Suspension Warehouse").lead.company_name, "Accurate Full-Svc Vehicle Ctr");
eq("kept: the one naming the most people", keepOf("Aht Wisconsin Windows").lead.city, "Clintonville");
eq("kept: the one naming more people, at the same phone", keepOf("Al Dix Concrete Inc").lead.contact_name, "Allan Dix");
eq("kept: the one with the most filled in, when nobody is named", keepOf("AC Asphalt Specialists").lead.phone, "(920) 865-7279");
eq("kept: the first, when they tie", keepOf("Acculevel").lead.city, "De Pere");
eq("why each group is one", groups.map((g) => g.why.join("+")), ["name", "name", "contact", "phone+name", "phone", "phone+name"]);
check("an FEIN outweighs any number of people", keepScore({ lead: { ein: "39-1178301" }, contacts: 0 }) > keepScore({ lead: { contact_name: "A" }, contacts: 50 }));

// --- names a client took off before ---------------------------------------
const removed = removalMatcher([
  { source: "lead", reason: "dont_call", company_name: "Someone Else", phone: "920-766-4344" },
  { source: "lead", reason: "current_customer", company_name: "Acoca Coffee", zip: "54911" },
  { source: "lead", reason: "deletion", company_name: "Nobody", ein: "39-1178301" },
  { source: "import", reason: "deletion", company_name: "Acculevel", address: "2149 Velp Ave # 102", zip: "54303", phone: "(920) 310-3150" },
]);
eq("by phone", removed(rows[13].lead)?.reason, "dont_call");
eq("by name in the same ZIP", removed({ company_name: "ACOCA COFFEE LLC", zip: "54911-1234" })?.reason, "current_customer");
eq("…not in another ZIP or city", removed({ company_name: "Acoca Coffee", zip: "53202", city: "Milwaukee" }), null);
eq("by EIN", removed(rows[5].lead)?.reason, "deletion");
eq("a duplicate left off before: that location again", removed(rows[4].lead)?.source, "import");
eq("…but not the record kept from its group", removed(rows[3].lead), null);
eq("nothing on the list, nothing taken off", removalMatcher([])(rows[0].lead), null);

console.log(failures ? `\n${failures} test(s) failed.\n` : "\nAll dedupe tests passed.\n");
process.exit(failures ? 1 : 0);
