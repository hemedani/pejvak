import { Suspense } from "react";

import { getMe } from "@/app/actions/auth/get-me";
import { adminGetPlatformSetting } from "@/app/actions/admin/platform/get-platform-setting";
import { PlatformForm } from "@/components/admin/platform-form";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, Skeleton } from "@/components/ui/state";

export default function AdminPlatformPage() {
  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <PageHeader
        overline="Operator console"
        title="Platform"
        description="The four global switches. Prices and limits are plan rows, not settings."
      />

      <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
        <PlatformPanel />
      </Suspense>
    </div>
  );
}

async function PlatformPanel() {
  const [result, me] = await Promise.all([adminGetPlatformSetting(), getMe()]);

  if (!result.success) {
    return <ErrorState failure={result.error} retryHref="/admin/platform" />;
  }

  const canMutate = me.success && me.body.role === "admin";

  return <PlatformForm setting={result.body} canMutate={canMutate} />;
}
