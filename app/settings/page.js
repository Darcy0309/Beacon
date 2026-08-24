import Topbar from "@/components/topbar";
import ToastButton from "@/components/toast-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" sub="Branding, security, and email" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Company name"><Input defaultValue="Signature Marketing" /></Field>
              <Field label="Product name"><Input defaultValue="Beacon" /></Field>
              <Field label="Logo URL"><Input defaultValue="https://cdn.signaturemktg.net/beacon-logo.svg" /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Email (SMTP)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="SMTP host"><Input defaultValue="smtp.office365.com" /></Field>
              <Field label="From address"><Input defaultValue="signatureleads@signaturemktg.net" /></Field>
              <Field label="Authentication"><Input defaultValue="OAuth2 (Microsoft 365)" /></Field>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>IP Lockdown</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Allowed IP addresses (one per line)">
              <Textarea defaultValue={"198.51.100.24\n203.0.113.0/24\n192.0.2.55"} className="min-h-28 font-mono text-xs" />
            </Field>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <ToastButton message="Settings saved">Save changes</ToastButton>
        </div>
      </div>
    </>
  );
}
