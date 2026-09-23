"use client";

import { useState, type FormEvent } from "react";

export function TeamInviteForm() {
  const [token, setToken] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    const response = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role: "member" }) });
    const body = await response.json();
    setToken(response.ok ? body.token : "Invite failed");
  }
  return <form onSubmit={submit}><label className="field">Invite email<input name="email" type="email" required /></label><button className="primary">Create invite</button>{token && <p role="status">{token}</p>}</form>;
}
