"use client";

export function UserMenu({ email }: { email: string }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }
  return <div>{email} <button onClick={logout} type="button">Sign out</button></div>;
}
