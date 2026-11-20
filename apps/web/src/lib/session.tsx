"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./data";
import type { Branch, Role, User } from "./types";

const BRANCH_KEY = "rbms.branch";

type SessionValue = {
  user: User;
  /** Branches this user can access (admin: all) */
  branches: Branch[];
  /** The branch the app is currently working in */
  branch: Branch | null;
  setBranchId: (id: string) => void;
  reloadBranches: () => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

function readStoredBranch(): string | null {
  try {
    return window.localStorage.getItem(BRANCH_KEY);
  } catch {
    return null;
  }
}

function pickBranch(user: User, branches: Branch[], preferred: string | null): string | null {
  if (user.branchId) return user.branchId;
  const active = branches.filter((b) => b.active);
  return (active.find((b) => b.id === preferred) ?? active[0])?.id ?? null;
}

export function SessionProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchIdState] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.auth
      .me()
      .then(async (me) => {
        if (!me) {
          router.replace("/login");
          return;
        }
        const list = await api.branches.list();
        if (!active) return;
        setBranches(list);
        setBranchIdState(pickBranch(me, list, readStoredBranch()));
        setUser(me);
      })
      .catch(() => router.replace("/login"));
    return () => {
      active = false;
    };
  }, [router]);

  const setBranchId = useCallback((id: string) => {
    setBranchIdState(id);
    try {
      window.localStorage.setItem(BRANCH_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const reloadBranches = useCallback(async () => {
    const list = await api.branches.list();
    setBranches(list);
    setBranchIdState((current) => {
      if (!user) return current;
      const stillActive = list.some((b) => b.id === current && b.active);
      return stillActive ? current : pickBranch(user, list, null);
    });
  }, [user]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    router.replace("/login");
  }, [router]);

  const value = useMemo<SessionValue | null>(() => {
    if (!user) return null;
    return {
      user,
      branches,
      branch: branches.find((b) => b.id === branchId) ?? null,
      setBranchId,
      reloadBranches,
      logout,
      hasRole: (...roles) => roles.includes(user.role),
    };
  }, [user, branches, branchId, setBranchId, reloadBranches, logout]);

  if (!value) return <>{fallback}</>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
