"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeletePatientButton({ id }: { id: string }) {
  const router = useRouter();
  async function del() {
    if (!confirm("この患者と関連カルテ・画像をすべて削除します。よろしいですか？"))
      return;
    const supabase = createClient();
    const { error } = await supabase.from("patients").delete().eq("id", id);
    if (error) {
      alert("削除に失敗しました: " + error.message);
      return;
    }
    router.replace("/patients");
    router.refresh();
  }
  return (
    <button onClick={del} className="text-sm text-red-500 hover:underline">
      患者を削除
    </button>
  );
}
