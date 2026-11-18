/**
 * A recorded call's AI summary (client, Nov 2026), from the server: its transcript given to Claude,
 * which answers with a short summary (overview, facts worth keeping, next step).
 *
 * Its key, in the server's environment: ANTHROPIC_API_KEY; without it, "AI summary" says it isn't
 * set up. (ANTHROPIC_BASE_URL only for the tests' stand-in.)
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SUMMARY_SCHEMA, readSummary, transcriptText } from "@/lib/call-summary";

// Haiku: about 40x cheaper than Opus a summary (client's choice, Nov 2026), plenty for a call recap.
export const SUMMARY_MODEL = "claude-haiku-5-5";

const SYSTEM = `You summarize recorded sales calls for Lighthouse, a CRM used by an insurance marketing team that calls businesses to set appointments and learn when their commercial insurance renews (the "X-date").

Each line of the transcript is "m:ss Speaker: words". Our caller is marked "(our caller)", the person reached "(prospect)". The transcript is machine-made, so words can be misheard; don't invent anything that wasn't said.

Write for a busy manager reading it in five seconds: plain words, no filler, no headings. Facts like dates, carriers, prices and names exactly as said. If the call was a voicemail, a wrong number or too short to say anything, say so in the overview and leave points empty.`;

/** Whether calls can be summarized here: the Anthropic key is set. */
export const summariesReady = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

let client = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim(), timeout: 45_000, maxRetries: 1 }));

/**
 * The summary of a call's transcript lines: { summary } or { error } (said plainly, for the person
 * who asked). `ours` / `theirs`: the caller's and the contact's names, when known.
 */
export async function summarizeCall(lines, { ours, theirs } = {}) {
  if (!summariesReady()) return { error: "AI summaries aren't set up on the server yet: an administrator adds the Anthropic API key (ANTHROPIC_API_KEY)." };
  const text = transcriptText(lines, { ours, theirs });
  if (!text) return { error: "There's nothing in this call's transcript to summarize." };

  let response;
  try {
    response = await anthropic().messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 8000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SUMMARY_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `<transcript>\n${text}\n</transcript>\n\nSummarize this call.` }],
    });
  } catch (err) {
    console.error("[call-summaries] not written", err?.status ?? "", err?.message ?? err);
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      return { error: "Anthropic refused the server's API key. An administrator checks ANTHROPIC_API_KEY." };
    }
    if (err instanceof Anthropic.RateLimitError) return { error: "The AI is busy right now. Try again in a minute." };
    if (err instanceof Anthropic.APIConnectionError) return { error: "Couldn't reach the AI. Try again in a moment." };
    if (err instanceof Anthropic.APIError) return { error: `The AI couldn't summarize this call (${err.status ?? "error"}). Try again in a moment.` };
    return { error: "The AI couldn't summarize this call. Try again in a moment." };
  }

  if (response.stop_reason === "refusal") return { error: "The AI declined to summarize this call." };
  if (response.stop_reason === "max_tokens") return { error: "The summary came back cut off. Try again." };
  const answer = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const summary = readSummary(answer);
  if (!summary) {
    console.error("[call-summaries] unreadable answer", answer.slice(0, 200));
    return { error: "The AI's summary couldn't be read. Try again." };
  }
  return { summary, model: response.model || SUMMARY_MODEL };
}
