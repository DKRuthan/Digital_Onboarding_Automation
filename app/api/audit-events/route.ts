import { NextResponse } from "next/server";
import { getDefaultWorkspaceId } from "@/lib/audit/audit-env";
import {
  buildRequestAuditMetadata,
  writeAuditLog,
} from "@/lib/audit/audit-log";
import {
  UI_AUDIT_MAX_BODY_BYTES,
  buildUiAuditMetadata,
  getUiAuditPermission,
  parseUiAuditRequestBody,
} from "@/lib/audit/ui-audit-events";
import { requireApiPermission } from "@/lib/auth/api-auth";

/**
 * Protected UI-origin audit ingestion (Phase J-6D).
 * Client sends action + target only; server stamps actor, workspace, and source.
 */
export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > UI_AUDIT_MAX_BODY_BYTES) {
    return NextResponse.json(
      { success: false, error: "Payload too large" },
      { status: 400 },
    );
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > UI_AUDIT_MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: "Payload too large" },
        { status: 400 },
      );
    }
    raw = text ? JSON.parse(text) : null;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = parseUiAuditRequestBody(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { success: false, error: parsed.error },
      { status: 400 },
    );
  }

  const { body } = parsed;
  const permission = getUiAuditPermission(body.action);
  const authResult = await requireApiPermission(permission);
  if (!authResult.ok) {
    return authResult.response;
  }

  const reqMeta = buildRequestAuditMetadata(request);
  await writeAuditLog({
    action: body.action,
    targetType: body.targetType,
    targetId: body.targetId ?? null,
    result: body.result ?? "success",
    metadata: buildUiAuditMetadata(body.metadata),
    workspaceId: getDefaultWorkspaceId(),
    actorUserId: authResult.userId,
    actorRole: authResult.role,
    source: "ui",
    severity: "info",
    authRequired: authResult.authRequired,
    permission,
    ...reqMeta,
  });

  return NextResponse.json({ success: true });
}
