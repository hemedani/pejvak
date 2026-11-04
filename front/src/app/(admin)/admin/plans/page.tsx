import Link from "next/link";
import { Suspense } from "react";

import { getMe } from "@/app/actions/auth/get-me";
import { adminListPlans } from "@/app/actions/admin/plans/list-plans";
import { PlanEditor } from "@/components/admin/plan-editor";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, Skeleton } from "@/components/ui/state";
import type { RawSearchParams } from "@/lib/admin/url";

export default async function AdminPlansPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const includeInactive = params.includeInactive === "1";

  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <PageHeader
        overline="Operator console"
        title="Plans"
        description="Prices and limits are rows, not constants. Editing a plan changes what every future entitlement resolves to."
        actions={
          <Button asChild variant="secondary" size="md">
            <Link href={includeInactive ? "/admin/plans" : "/admin/plans?includeInactive=1"}>
              {includeInactive ? "Hide archived" : "Show archived"}
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<PlanSkeleton />}>
        <PlansData includeInactive={includeInactive} />
      </Suspense>
    </div>
  );
}

async function PlansData({ includeInactive }: { includeInactive: boolean }) {
  const [result, me] = await Promise.all([adminListPlans(includeInactive), getMe()]);

  if (!result.success) {
    return (
      <ErrorState
        failure={result.error}
        retryHref={includeInactive ? "/admin/plans?includeInactive=1" : "/admin/plans"}
      />
    );
  }

  const canMutate = me.success && me.body.role === "admin";

  return <PlanEditor plans={result.body.rows} canMutate={canMutate} />;
}

function PlanSkeleton() {
  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-40 w-full" />
      ))}
    </div>
  );
}
