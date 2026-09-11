import AppTabs from "@/components/app-tabs";
import { useSyncLifecycle } from "@/hooks/use-sync";

export default function TabsLayout() {
  useSyncLifecycle();
  return <AppTabs />;
}
