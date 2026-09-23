"use client";
import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { IconLogout, IconMoon, IconSun } from "@tabler/icons-react";

export function UserMenu({ email }: { email: string }) {
  const [dark, setDark] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  function toggleTheme() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    try { localStorage.setItem("crosswire-theme", next ? "dark" : "light"); } catch {}
    setDark(next);
  }
  async function logout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      window.location.assign("/login");
    } catch { setError("Sign out failed. Try again."); }
  }
  return <div className="user-menu"><p className="account-email" title={email}>{email}</p><div className="account-actions">
    <Button variant="tertiary" size="sm" onPress={logout}><IconLogout size={17} aria-hidden="true" />Sign out</Button>
    <Button variant="tertiary" size="sm" isIconOnly aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onPress={toggleTheme}>{dark ? <IconSun size={18} aria-hidden="true" /> : <IconMoon size={18} aria-hidden="true" />}</Button>
  </div>{error && <p role="alert" className="error">{error}</p>}</div>;
}
