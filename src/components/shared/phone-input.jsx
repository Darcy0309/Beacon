"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { typePhone } from "@/lib/format";

/**
 * A phone number field (Sean, Oct 2026): it takes digits only and groups them
 * as they come, 602-555-0100, whether typed or pasted ("(602) 555-0100",
 * "6025550100"); a word after it ("cell") is dropped, and an extension can
 * follow a whole number ("x203"). A number already on file shows the same way.
 * Blank until filled in, so a missing number shows. Submits as an ordinary
 * input called `name`.
 */
export default function PhoneInput({ name, defaultValue = "", invalid, placeholder = "", ...rest }) {
  const [value, setValue] = useState(() => typePhone(defaultValue));
  return (
    <Input {...rest} name={name} value={value} onChange={(e) => setValue(typePhone(e.target.value))}
      type="tel" inputMode="tel" autoComplete="off" maxLength={24} placeholder={placeholder} aria-invalid={invalid} data-phone-input={name} />
  );
}
