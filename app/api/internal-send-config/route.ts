import { NextResponse } from "next/server";
import {
  recordApiPermissionDenied,
  recordConfigInternalSendRead,
} from "@/lib/audit/api-route-audit";
import { requireApiPermission } from "@/lib/auth/api-auth";
import { getPublicSendGridConfig } from "@/lib/sendgrid-env";

/** Returns safe SendGrid config for UI routing previews (no API key). */
export async function GET(request: Request) {
  const authResult = await requireApiPermission("view_dashboard");
  if (!authResult.ok) {
    recordApiPermissionDenied(request, "view_dashboard", authResult);
    return authResult.response;
  }

  const config = getPublicSendGridConfig();
  recordConfigInternalSendRead(request, authResult, {
    configured: config.configured,
    sendMode: config.sendMode,
    customerSendsEnabled: config.customerSendsEnabled,
    internalSendsEnabled: config.internalSendsEnabled,
    testSendEnabled: config.testSendEnabled,
    validationErrorCount: config.validationErrors.length,
  });

  return NextResponse.json(config);
}
