"use client";
import { Button } from "@heroui/react";
import { IconLogout, IconMoon, IconSun } from "@tabler/icons-react";
import { useEffect, useState } from "react";

export function UserMenu({ username }: { username: string }) {
  const [dark, setDark] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggleTheme() {
    const next = !dark;
    const update = () => {
      document.documentElement.classList.toggle("dark", next);
      document.documentElement.classList.toggle("light", !next);
      document.documentElement.style.colorScheme = next ? "dark" : "light";
      try {
        localStorage.setItem("crosswire-theme", next ? "dark" : "light");
      } catch {}
      setDark(next);
    };
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      document.startViewTransition(update);
    else update();
  }
  async function logout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      window.location.assign("/login");
    } catch {
      setError("Sign out failed. Try again.");
    }
  }
  return (
    <div className="user-menu">
      <p className="account-username" title={username}>
        {username}
      </p>
      <div className="account-actions">
        <Button variant="tertiary" size="sm" onPress={logout}>
          <IconLogout size={17} aria-hidden="true" />
          Sign out
        </Button>
        <Button
          variant="tertiary"
          size="sm"
          isIconOnly
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          onPress={toggleTheme}
        >
          {dark ? (
            <IconSun size={18} aria-hidden="true" />
          ) : (
            <IconMoon size={18} aria-hidden="true" />
          )}
        </Button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
