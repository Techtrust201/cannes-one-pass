"use client";

import { useState, useEffect, useCallback } from "react";
import type { Feature, UserRole } from "@prisma/client";

interface UserPermission {
  feature: Feature;
  canRead: boolean;
  canWrite: boolean;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  permissions: UserPermission[];
}

export function usePermissions() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    // Au premier chargement mobile (ex. ouverture depuis un scan), la session
    // better-auth n'est pas toujours « chaude » : `/api/auth/me` peut répondre
    // 401 ou échouer de façon transitoire alors que le cookie est valide (le
    // middleware a déjà laissé passer). On retente brièvement avant de conclure
    // à une déconnexion, pour ne pas rediriger à tort vers /login. Une session
    // réellement expirée finit `user = null` après les tentatives -> login.
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 400;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    setLoading(true);
    setError(null);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const isLastAttempt = attempt === MAX_ATTEMPTS;
      try {
        const response = await fetch("/api/auth/me");

        if (response.ok) {
          setUser(await response.json());
          setError(null);
          setLoading(false);
          return;
        }

        // 401/403 : non authentifié. Possible état transitoire au 1er paint :
        // on retente, et on ne tranche (user=null) qu'à la dernière tentative.
        if (response.status === 401 || response.status === 403) {
          if (isLastAttempt) {
            setUser(null);
            setLoading(false);
            return;
          }
          await wait(RETRY_DELAY_MS);
          continue;
        }

        throw new Error("Erreur de chargement des permissions");
      } catch (err) {
        if (isLastAttempt) {
          setUser(null);
          setError(err instanceof Error ? err.message : "Erreur inconnue");
          setLoading(false);
          return;
        }
        await wait(RETRY_DELAY_MS);
      }
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback(
    (feature: Feature, type: "read" | "write" = "read"): boolean => {
      if (!user) return false;

      // Super admin a accès à tout
      if (user.role === "SUPER_ADMIN") return true;

      const perm = user.permissions.find((p) => p.feature === feature);
      if (!perm) return false;

      return type === "read" ? perm.canRead : perm.canWrite;
    },
    [user]
  );

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isAdmin =
    user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  return {
    user,
    loading,
    error,
    hasPermission,
    isSuperAdmin,
    isAdmin,
    refetch: fetchPermissions,
  };
}
