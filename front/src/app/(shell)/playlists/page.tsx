import { PlannedSurface } from "@/components/ui/planned";

export const metadata = { title: "فهرست‌ها" };

/** Phase 3.3. Acts exist: `getMyPlaylists`, `createPlaylist`, `updatePlaylist`, `deletePlaylist`. */
export default function PlaylistsPage() {
  return (
    <PlannedSurface
      overline="مجموعه‌های شما"
      title="فهرست‌ها"
      description="ترکیب دلخواهی از ترک‌ها، با ترتیب قابل تغییر."
      icon="playlist"
      items={[
        "ساخت، تغییر نام و حذف فهرست",
        "جابه‌جایی ترک‌ها و ذخیرهٔ ترتیب",
        "شروع پخش یک فهرست به‌عنوان یک «اجرا»",
      ]}
    />
  );
}
