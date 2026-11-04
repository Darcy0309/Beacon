#!/usr/bin/env node
/** Unit tests for the phone's Twilio line: the calling token, a webhook's signature, the numbers it may call, TwiML. */
import { createHmac } from "node:crypto";
import { callableNumber, identityOf, twilioSignature, twiml, userIdOf, validTwilioSignature, voiceToken, xml } from "../../src/lib/twilio-voice.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

// The token: Twilio's JWT, signed with the API key's secret.
const now = Date.UTC(2026, 10, 3, 12);
const token = voiceToken({ accountSid: "AC1", apiKey: "SK1", apiSecret: "shh", appSid: "AP1", identity: "lh_42", ttl: 600, now });
const [h, p, sig] = token.split(".");
const header = JSON.parse(Buffer.from(h, "base64url"));
const payload = JSON.parse(Buffer.from(p, "base64url"));
check("token header: HS256, Twilio's content type", header.alg === "HS256" && header.cty === "twilio-fpa;v=1");
check("token: issued by the API key, for the account, for ten minutes", payload.iss === "SK1" && payload.sub === "AC1" && payload.exp - payload.iat === 600 && payload.jti.startsWith("SK1-"));
check("token: who, calls coming in, the TwiML App", payload.grants.identity === "lh_42" && payload.grants.voice.incoming.allow === true && payload.grants.voice.outgoing.application_sid === "AP1");
check("token: signed with the secret", sig === createHmac("sha256", "shh").update(`${h}.${p}`).digest("base64url"));

// A webhook's signature, as Twilio documents it (its own example).
const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
check("signature: Twilio's documented example", twilioSignature("12345", url, params) === "0/KCTR6DLpKmkAf8muzZqo1nDgQ=", twilioSignature("12345", url, params));
check("signature: accepted when it matches", validTwilioSignature("12345", url, params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ="));
check("signature: refused for another token, a changed field, or none",
  !validTwilioSignature("54321", url, params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=") &&
  !validTwilioSignature("12345", url, { ...params, To: "+19005551212" }, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=") &&
  !validTwilioSignature("12345", url, params, null) && !validTwilioSignature("12345", url, params, "short"));
const withPort = twilioSignature("12345", "https://mycompany.com:443/myapp.php?foo=1&bar=2", params);
check("signature: signed with :443 still matches the URL without it", validTwilioSignature("12345", url, params, withPort));

// Who a browser is.
check("identity: a user's, and back", identityOf(42) === "lh_42" && userIdOf("client:lh_42") === 42 && userIdOf("lh_7") === 7);
check("identity: anything else is nobody", userIdOf("client:lh_0") === null && userIdOf("client:bob") === null && userIdOf("+16025550100") === null && userIdOf(null) === null);

// The numbers a call from Lighthouse may ring.
check("callable: US numbers, as tel: links or typed", callableNumber("tel:+16025550144")?.number === "+16025550144" && callableNumber("(602) 555-0144")?.number === "+16025550144" && callableNumber("16025550144")?.number === "+16025550144");
check("callable: an extension sent as tones once answered", callableNumber("tel:+12142697488,203")?.tones === "ww203" && callableNumber("tel:+12142697488")?.tones === "");
check("callable: not abroad, premium lines, short codes or bad area codes",
  [ "tel:+442079460000", "tel:+19005550144", "tel:+19765550144", "tel:*67", "tel:+11025550144", "tel:+16021550144", "", null ].every((t) => callableNumber(t) === null));

check("TwiML: escaped and wrapped", xml(`a&b<"c">'`) === "a&amp;b&lt;&quot;c&quot;&gt;&apos;" && twiml("<Hangup/>") === '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');

console.log(failures ? `\n${failures} Twilio check(s) failed.\n` : "\nAll Twilio checks passed.\n");
process.exit(failures ? 1 : 0);
