import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ClipboardCheck, ShieldAlert } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ROUTES } from "../../routes/paths";
import { TestsApi, type TestAttempt } from "../../api/tests";

export const TestResultPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [attempt, setAttempt] = React.useState<TestAttempt | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!attemptId) return;
    TestsApi.getAttempt(attemptId)
      .then((res: { data: { test: unknown; remainingSeconds: number } & TestAttempt }) => {
        setAttempt(res.data as TestAttempt);
      })
      .catch((err: any) => setError(err?.response?.data?.message ?? "Failed to load result."))
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return <div className="glass-surface rounded-3xl p-6 text-sm text-slate-300">Loading result...</div>;
  }

  if (!attempt) {
    return <div className="glass-surface rounded-3xl p-6 text-sm text-slate-300">{error ?? "Result not available."}</div>;
  }

  return (
    <div className="space-y-4">
      <section className="glass-surface rounded-3xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Test result</p>
            <h1 className="text-lg font-semibold text-slate-50">Score: {attempt.score ?? 0}</h1>
            <p className="mt-1 text-xs text-slate-300">Submitted {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "recently"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.studentTests)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to tests
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4 text-[11px]">
          <div className="rounded-2xl bg-slate-900/80 px-3 py-3">
            <p className="text-[10px] text-slate-400">Score</p>
            <p className="text-lg font-semibold text-slate-50">{attempt.score ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-slate-900/80 px-3 py-3">
            <p className="text-[10px] text-slate-400">Tab switches</p>
            <p className="text-lg font-semibold text-slate-50">{attempt.tabSwitchCount}</p>
          </div>
          <div className="rounded-2xl bg-slate-900/80 px-3 py-3">
            <p className="text-[10px] text-slate-400">Auto submitted</p>
            <p className="text-lg font-semibold text-slate-50">{attempt.autoSubmitted ? "Yes" : "No"}</p>
          </div>
          <div className="rounded-2xl bg-slate-900/80 px-3 py-3">
            <p className="text-[10px] text-slate-400">Started at</p>
            <p className="text-[11px] font-medium text-slate-50">{new Date(attempt.startedAt).toLocaleString()}</p>
          </div>
        </div>

        {attempt.autoSubmitted && (
          <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-[11px] text-amber-100">
            Maximum tab switch limit exceeded. Your test has been auto-submitted.
          </div>
        )}

        {attempt.tabSwitchCount > 0 && (
          <div className="mt-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-3 text-[11px] text-rose-100">
            <ShieldAlert className="mr-2 inline-block h-4 w-4" />
            {attempt.tabSwitchCount} tab switch violations were recorded on this attempt.
          </div>
        )}

        <div className="mt-4 space-y-2 rounded-3xl border border-slate-800 bg-slate-950/60 p-4 text-[11px] text-slate-300">
          <div className="flex items-center gap-2 text-slate-50">
            <ClipboardCheck className="h-4 w-4 text-emerald-400" />
            <p className="font-medium">Saved answers</p>
          </div>
          <div className="space-y-2">
            {attempt.answers.map((answer) => (
              <div key={answer.questionId} className="rounded-2xl bg-slate-900/80 px-3 py-2">
                <p className="font-medium text-slate-50">{answer.questionType}</p>
                <p className="text-slate-400">{answer.selectedOption || answer.textAnswer || "No answer"}</p>
              </div>
            ))}
          </div>
        </div>

        {error && <div className="mt-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">{error}</div>}
      </section>
    </div>
  );
};