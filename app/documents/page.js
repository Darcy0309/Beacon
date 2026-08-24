import { Upload, FileText } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import ToastButton from "@/components/toast-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { documents } from "@/lib/data";

const typeTone = { PDF: "rose", DOCX: "sky", CSV: "emerald", PNG: "violet" };

export default function DocumentsPage() {
  return (
    <>
      <Topbar title="Documents" sub="Lead sheets, contracts, and assets" />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>All documents</CardTitle>
            <ToastButton size="sm" message="Upload dialog opened"><Upload /> Upload</ToastButton>
          </CardHeader>
          <CardContent className="p-0">
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
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{d.name}</span>
                      </div>
                    </TableCell>
                    <TableCell><ToneBadge tone={typeTone[d.type]}>{d.type}</ToneBadge></TableCell>
                    <TableCell className={d.client === "—" ? "text-muted-foreground" : ""}>{d.client}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{d.size}</TableCell>
                    <TableCell className="text-muted-foreground">{d.date}</TableCell>
                    <TableCell className="text-right"><RowActions name={d.name} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
