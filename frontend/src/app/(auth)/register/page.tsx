"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { register } from "@/stores/auth";
import { toast } from "@/stores/toast";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,50}$/;

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", username: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);

  function validate(): boolean {
    const next: Record<string, string | null> = {};
    if (!form.email.trim()) next.email = "Email is required";
    if (!USERNAME_PATTERN.test(form.username)) {
      next.username = "3-50 characters, letters/numbers/underscore only";
    }
    if (form.password.length < 8) next.password = "At least 8 characters";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      await register({
        email: form.email.trim(),
        username: form.username,
        password: form.password,
      });
      toast("Account created!", "success");
      router.push("/");
    } catch (err) {
      setErrors({ email: err instanceof Error ? err.message : "Registration failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-xl font-bold tracking-tight">Join</h1>
      <p className="mt-1 text-sm text-muted">
        Create an account to listen, like, download — and upload your own music.
      </p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.email}
        />
        <Input
          label="Username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={50}
          pattern="[a-zA-Z0-9_]*"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          error={errors.username}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
        />
        <Button type="submit" loading={busy} className="mt-1">
          Create account
        </Button>
      </form>
      <p className="mt-5 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent transition-colors hover:text-accent-strong">
          Log in
        </Link>
      </p>
    </div>
  );
}
