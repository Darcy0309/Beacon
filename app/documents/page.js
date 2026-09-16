import { FileText, Files, HardDrive, Building2 } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDocuments } from "@/lib/queries";
import { deleteDocument } from "@/lib/actions";

export const dynamic = "force-dynamic";

const typeTone = { PDF: "rose", DOCX: "cyan", CSV: "emerald", PNG: "violet" };

export default async function DocumentsPage() {
  const documents = await getDocuments();
  const byType = {};
  for (const d of documents) byType[d.type] = (byType[d.type] || 0) + 1;
  const clients = new Set(documents.map((d) => d.client).filter((c) => c !== "—")).size;

  const tiles = [
    { label: "Documents", value: String(documents.length), note: "in the library",
      icon: Files, accent: "var(--neon-cyan)", series: Object.values(byType), bars: true },
    { label: "File Types", value: String(Object.keys(byType).length), note: Object.keys(byType).join(" · ") || "—",
      icon: FileText, accent: "var(--neon-violet)", series: Object.values(byType), bars: true },
    { label: "Clients Covered", value: String(clients), note: "with documents on file",
      icon: Building2, accent: "var(--neon-emerald)", series: documents.map((_, i) => i + 1) },
    { label: "Most Common", value: Object.entries(byType).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—",
      note: "file type", icon: HardDrive, accent: "var(--neon-amber)", series: Object.values(byType), bars: true },
  ];

  return (
    <>
      <Topbar title="Documents" sub={`${documents.length} lead sheets, contracts, and assets`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label="All Documents" icon={Files} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <FileText className="size-4 shrink-0 text-primary" />
                      <span className="font-medium">{d.name}</span>
                    </div>
                  </TableCell>
                  <TableCell><ToneBadge tone={typeTone[d.type] ?? "slate"}>{d.type}</ToneBadge></TableCell>
                  <TableCell className={d.client === "—" ? "text-muted-foreground" : ""}>{d.client}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{d.size}</TableCell>
                  <TableCell className="text-muted-foreground">{d.date}</TableCell>
                  <TableCell className="text-right"><RowActions name={d.name} id={d.id} onDelete={deleteDocument} /></TableCell>
                </TableRow>
              ))}
              {documents.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No documents yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
