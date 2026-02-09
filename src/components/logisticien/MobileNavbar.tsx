"use client";

import Link from "next/link";
import { Menu, Home, Plus, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

interface MobileNavbarProps {
  onBurger?: () => void;
  hidden?: boolean;
}

export default function MobileNavbar({ onBurger, hidden }: MobileNavbarProps) {
  const router = useRouter();

  if (hidden) return null;

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 bg-white border-t border-gray-200 shadow-lg flex justify-around items-center sm:hidden pb-[env(safe-area-inset-bottom)]">
      <button
        onClick={onBurger}
        className="flex flex-col items-center justify-center text-[#4F587E] hover:text-[#3B4252] focus:outline-none min-h-[56px] min-w-[56px] py-2"
        aria-label="Ouvrir le menu"
      >
        <Menu size={24} />
        <span className="text-[10px] mt-0.5 font-medium">Menu</span>
      </button>
      <Link
        href="/logisticien"
        className="flex flex-col items-center justify-center text-[#4F587E] hover:text-[#3B4252] min-h-[56px] min-w-[56px] py-2"
      >
        <Home size={22} />
        <span className="text-[10px] mt-0.5 font-medium">Accueil</span>
      </Link>
      <Link
        href="/logisticien/nouveau?step=1"
        className="flex flex-col items-center justify-center text-[#4F587E] hover:text-[#3B4252] min-h-[56px] min-w-[56px] py-2"
      >
        <Plus size={24} />
        <span className="text-[10px] mt-0.5 font-medium">Nouveau</span>
      </Link>
      <button
        onClick={async () => {
          await authClient.signOut();
          router.push("/login");
        }}
        className="flex flex-col items-center justify-center text-red-500 hover:text-red-700 focus:outline-none min-h-[56px] min-w-[56px] py-2"
        aria-label="Se déconnecter"
      >
        <LogOut size={22} />
        <span className="text-[10px] mt-0.5 font-medium">Quitter</span>
      </button>
    </nav>
  );
}
