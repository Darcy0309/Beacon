#!/usr/bin/env node
/** Unit tests for email templates (lib/email-templates.js; client, Nov 2026). */
import assert from "node:assert/strict";
import { fileSize, fillTemplate, templateDraft } from "../../src/lib/email-templates.js";

const values = { first_name: "John", company: "Alpine Mechanical", my_name: "Sean Fipps", signature: "Regards,\nSean Fipps\nCapital Insurance Services" };

assert.equal(fillTemplate("Hi {first_name}, about {company}", values), "Hi John, about Alpine Mechanical");
assert.equal(fillTemplate("Hi { First_Name },", values), "Hi John,", "spaces and case forgiven");
assert.equal(fillTemplate("Hi {first_name},", { first_name: "" }), "Hi,", "nothing to fill: the field and its space go");
assert.equal(fillTemplate("{unknown} stays", values), "{unknown} stays");

const t = { subject: "Your renewal, {company}", body: "Hi {first_name},\n\nThanks for your time today.\n" };
assert.deepEqual(templateDraft(t, values), {
  subject: "Your renewal, Alpine Mechanical",
  body: "Hi John,\n\nThanks for your time today.\n\nRegards,\nSean Fipps\nCapital Insurance Services",
}, "the signature at the foot when the template doesn't place it");
const placed = templateDraft({ subject: "Hi", body: "Hi {first_name},\n\n{signature}\n\nP.S. {my_name}" }, values);
assert.equal(placed.body, "Hi John,\n\nRegards,\nSean Fipps\nCapital Insurance Services\n\nP.S. Sean Fipps", "…or where it does, once");
assert.equal(templateDraft({ subject: "  A   {company} ", body: "Body" }, { company: "X" }).subject, "A X");
assert.equal(templateDraft({ subject: "S", body: "Body" }, {}).body, "Body", "no signature to add");

assert.equal(fileSize(2.4 * 1024 * 1024), "2.4 MB");
assert.equal(fileSize(830 * 1024), "830 KB");
console.log("email templates: ok");
