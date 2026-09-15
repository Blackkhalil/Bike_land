import { redirect } from "next/navigation";

import { NavigationAdmin } from "@/components/admin/NavigationAdmin";
import { modeAcces, sessionAdminValide } from "@/lib/admin";
import { modeDonnees } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Toutes les pages de ce groupe exigent une session valide. */
export default async function LayoutAdminProtege({ children }: { children: React.ReactNode }) {
  if (!(await sessionAdminValide())) redirect("/admin/connexion");

  return (
    <div className="min-h-screen bg-craie text-noir-piste">
      <NavigationAdmin protege={modeAcces() === "protege"} modeDonnees={modeDonnees()} />
      <div className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:pl-[17.5rem]">{children}</div>
    </div>
  );
}
