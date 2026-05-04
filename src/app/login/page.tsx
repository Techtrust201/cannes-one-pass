import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session) {
    redirect("/logisticien");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#3F4660] to-[#2C2F3F] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4 overflow-hidden">
            <Image
              src="/icons/icon-192.png"
              alt="Cannes One Pass — Palais des Festivals et des Congrès de Cannes"
              width={56}
              height={56}
              priority
              className="object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-white">
            Palais des Festivals
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Connectez-vous pour accéder à la plateforme
          </p>
        </div>

        <Suspense
          fallback={
            <div className="bg-white rounded-2xl shadow-xl p-8 flex items-center justify-center">
              <svg
                className="animate-spin h-6 w-6 text-[#3F4660]"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <p className="text-center text-white/40 text-xs mt-6">
          &copy; {new Date().getFullYear()} Palais des Festivals &amp;
          des Congrès de Cannes
        </p>
      </div>
    </div>
  );
}
