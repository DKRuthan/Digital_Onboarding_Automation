import { NextResponse } from "next/server";
import {
  exportAuditLogsCsv,
  listAuditLogs,
  type ListAuditLogsParams,
} from "@/lib/audit/audit-read";
import { requireApiPermission } from "@/lib/auth/api-auth";

function parseListParams(url: URL): ListAuditLogsParams {
  const get = (key: string) => url.searchParams.get(key)?.trim() || undefined;
  const limitRaw = get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  return {
    limit: Number.isFinite(limit) ? limit : undefined,
    action: get("action"),
    source: get("source"),
    severity: get("severity"),
    result: get("result"),
    actorUserId: get("actorUserId"),
    from: get("from"),
    to: get("to"),
  };
}

/** Protected read-only audit log list / CSV export (Phase J-6E). */
export async function GET(request: Request) {
  const authResult = await requireApiPermission("view_audit_logs");
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format")?.trim().toLowerCase();
  const result = await listAuditLogs(parseListParams(url));

  if (format === "csv") {
    const csv = exportAuditLogsCsv(result.rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="audit-logs.csv"',
      },
    });
  }

  return NextResponse.json({
    success: true,
    configured: result.configured,
    enabled: result.enabled,
    rows: result.rows,
    message: result.message,
  });
}
