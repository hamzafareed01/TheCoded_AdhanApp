import { useEffect, useState, FormEvent } from 'react';
import { Logo } from '../shared/Logo';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { apiFetch } from "../../lib/api";

export type LoggedInUser = {
    userId: string;
    email: string;
    name: string;
};

type LoginViewProps = {
    onLogin: (user: LoggedInUser) => void;
    storageKey: string;
};

export default function LoginView({ onLogin, storageKey }: LoginViewProps) {
    const [email, setEmail] = useState('demo@adhan.app');       // demo defaults
    const [password, setPassword] = useState('password123');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // If we already have a saved user, log them in automatically
    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (!saved) return;

        try {
            const parsed = JSON.parse(saved) as LoggedInUser;
            if (parsed && parsed.userId) {
                onLogin(parsed);
            }
        } catch {
            // ignore bad JSON
        }
    }, [onLogin, storageKey]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);

        try {
            setLoading(true);

            const res = await apiFetch("/api/auth/login", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const json = await res.json();

            if (!res.ok) {
                setError(json.error || 'Login failed. Please try again.');
                return;
            }

            // Save + bubble up to parent
            localStorage.setItem(storageKey, JSON.stringify(json));
            onLogin(json);
        } catch (err) {
            console.error(err);
            setError('Could not reach server. Is the backend running?');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <Logo />
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
                    <div>
                        <h1 className="text-white text-xl mb-1">Sign in to My Adhan Home</h1>
                        <p className="text-slate-400 text-sm">
                            Use the demo account for now. Later we&apos;ll replace this with
                            &quot;Login with Amazon / Google / Apple&quot;.
                        </p>
                    </div>

                    {error && (
                        <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-slate-200">
                                Email
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                className="bg-slate-950 border-slate-700 text-slate-100"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-slate-200">
                                Password
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                className="bg-slate-950 border-slate-700 text-slate-100"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                            {loading ? 'Signing in…' : 'Sign in'}
                        </Button>
                    </form>

                    <div className="text-xs text-slate-500 space-y-1">
                        <p>Demo credentials:</p>
                        <p>
                            <span className="font-mono">demo@adhan.app</span> /{' '}
                            <span className="font-mono">password123</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}