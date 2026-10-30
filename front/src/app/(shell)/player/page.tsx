import { PlannedSurface } from "@/components/ui/planned";

export const metadata = { title: "پخش" };

/** Phase 5. The engine, the session machine and the scrubber (plan §9). */
export default function PlayerPage() {
  return (
    <PlannedSurface
      overline="پخش‌کننده"
      title="پخش"
      description="پخش جریان آنلاین، با ثبت نشست و نشانه‌گذاری یادداشت."
      icon="player"
      items={[
        "یک المان صوتی در سطح ماژول، نه در ref کامپوننت",
        "نوار پیشرفت با نشانگر یادداشت‌ها",
        "ثبت نشست با محاسبهٔ زمان واقعی شنیدن",
        "MediaSession برای کنترل‌های سیستم",
      ]}
    />
  );
}
