"use client";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import { fmt, num } from "../lib/format";
import type { PayerRow } from "../lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

/** AG Grid themed to the plain tokens. */
export const gridTheme = themeQuartz.withParams({
  backgroundColor: "#FFFFFF",
  foregroundColor: "#1F2328",
  headerBackgroundColor: "#F6F8FA",
  headerTextColor: "#59636E",
  headerFontWeight: 600,
  headerFontSize: 12,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
  fontSize: 14,
  borderColor: "#E4E9EE",
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  columnBorder: false,
  headerColumnBorder: false,
  rowHeight: 44,
  headerHeight: 36,
  cellHorizontalPadding: 16,
  rowHoverColor: "#F6F8FA",
  accentColor: "#0969DA",
  borderRadius: 6,
});

function Recipient({ value }: ICellRendererParams<PayerRow, string>) {
  if (value === "Verified") return <span className="label label-success">Verified</span>;
  if (value === "Held") return <span className="label label-attention">Held for review</span>;
  return <span className="label">Unclaimed</span>;
}

export function PackageGrid({
  rows,
  currency,
  onPick,
}: {
  rows: PayerRow[];
  currency: string;
  onPick: (packageId: string) => void;
}) {
  const data = useMemo(() => [...rows].sort((a, b) => b.cents - a.cents), [rows]);
  const cols = useMemo<ColDef<PayerRow>[]>(() => {
    const right = ["cell-num", "ag-right-aligned-cell"];
    return [
      {
        field: "name",
        headerName: "Package",
        flex: 1.4,
        minWidth: 160,
        cellRenderer: (p: ICellRendererParams<PayerRow, string>) => <span className="cell-pkg">{p.value}</span>,
      },
      {
        field: "u",
        headerName: "Usage (u)",
        flex: 0.8,
        minWidth: 100,
        type: "rightAligned",
        cellClass: right,
        valueFormatter: (p) => num(p.value ?? 0),
      },
      {
        field: "c",
        headerName: "Criticality (c)",
        headerTooltip: "Set by the Treasurer (AI), bounded 0.5–2.0",
        flex: 0.9,
        minWidth: 120,
        type: "rightAligned",
        cellClass: right,
        valueFormatter: (p) => (p.value ?? 1).toFixed(1),
      },
      {
        field: "n",
        headerName: "Need (n)",
        headerTooltip: "Set by the Treasurer (AI), bounded 0.5–2.0",
        flex: 0.8,
        minWidth: 100,
        type: "rightAligned",
        cellClass: right,
        valueFormatter: (p) => (p.value ?? 1).toFixed(1),
      },
      {
        field: "cents",
        headerName: "Amount",
        flex: 0.9,
        minWidth: 110,
        type: "rightAligned",
        cellClass: [...right, "strong"],
        initialSort: "desc",
        valueFormatter: (p) => fmt(p.value ?? 0, currency),
      },
      { field: "status", headerName: "Recipient", flex: 1, minWidth: 140, cellRenderer: Recipient },
      {
        colId: "why",
        headerName: "",
        width: 172,
        minWidth: 172,
        sortable: false,
        cellRenderer: (p: ICellRendererParams<PayerRow>) => (
          <button
            className="btn btn-sm btn-invisible"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              if (p.data) onPick(p.data.id);
            }}
          >
            Why this amount?
          </button>
        ),
      },
    ];
  }, [currency, onPick]);
  return (
    <div className="grid-shell" style={{ height: 36 + data.length * 44 + 2 }}>
      <AgGridReact<PayerRow>
        theme={gridTheme}
        rowData={data}
        columnDefs={cols}
        getRowId={(p) => p.data.id}
        suppressMovableColumns
        defaultColDef={{ resizable: false, sortable: true }}
        onRowClicked={(e) => e.data && onPick(e.data.id)}
        onCellKeyDown={(e) => {
          const k = (e.event as KeyboardEvent | undefined)?.key;
          if ((k === "Enter" || k === " ") && e.data) onPick(e.data.id);
        }}
      />
    </div>
  );
}
