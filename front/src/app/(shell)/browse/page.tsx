import { PlannedSurface } from "@/components/ui/planned";

export const metadata = { title: "کاوش" };

/** Phase 4. The only surface where the web app can produce audio (plan §2 C2). */
export default function BrowsePage() {
  return (
    <PlannedSurface
      overline="مجموعه‌های آنلاین"
      title="کاوش"
      description="منابع آزاد و عمومی: آرشیو اینترنت، لیبری‌وکس، منهاج و دیگران."
      icon="browse"
      items={[
        "انتخاب زبان، سپس منبع، سپس مجموعه",
        "پورت آداپتورهای موبایل بدون وابستگی به React Native",
        "پروکسی سمت سرور برای منابعی که CORS نمی‌دهند",
        "ذخیره در قفسه و پخش از نشانی حل‌شده",
      ]}
    />
  );
}
