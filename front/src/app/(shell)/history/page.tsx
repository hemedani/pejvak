import { PlannedSurface } from "@/components/ui/planned";

export const metadata = { title: "تاریخ شنیدن" };

/**
 * Phase 3.2. The act exists (`getMyListeningHistory`) and the parser is written
 * (`lib/domain/session.ts`) — what is missing is the day-grouped view and the
 * stretch-aware paging, which is a design problem rather than a data problem: a
 * page must not split a stretch and then compute a verdict from the prefix.
 */
export default function HistoryPage() {
  return (
    <PlannedSurface
      overline="همهٔ نشست‌ها"
      title="تاریخ شنیدن"
      description="هر بار شنیدن، با زمان، مدت و نتیجه‌اش."
      icon="history"
      items={[
        "گروه‌بندی روزانه با مدت شنیدن هر روز",
        "فیلتر بازهٔ زمانی و نوع محتوا",
        "صفحه‌بندی‌ای که یک «استرچ» را از هم نمی‌شکند",
        "پیوند هر نشست به ترک و به اجرای مجموعه",
      ]}
    />
  );
}
