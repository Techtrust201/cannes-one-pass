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
    try {
      setLoading(true);
      const response = await fetch("/api/auth/me");

      if (!response.ok) {
        if (response.status === 401) {
          setUser(null);
          return;
        }
        throw new Error("Erreur de chargement des permissions");
      }

      const data = await response.json();
      setUser(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur inconnue"
      );
    } finally {
      setLoading(false);
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
