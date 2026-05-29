import React from "react";
import { useNavigate } from "react-router-dom";
import { CalendarRange, Clock, PlayCircle, RotateCw, FileCheck2 } from "lucide-react";
import { TestsApi, type TestListItem } from "../../api/tests";
import { Button } from "../../components/ui/button";
import { ROUTES } from "../../routes/paths";
import { cn } from "../../utils/cn";

const getState = (test: TestListItem) => {
  const now = Date.now();
  const start = new Date(test.startDateTime).getTime();
  const end = new Date(test.endDateTime).getTime();
  if (test.status !== "published") return "locked";
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "active";
};

export const StudentTestsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tests, setTests] = React.useState<TestListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    TestsApi.list()
      .then((res: { data: TestListItem[] }) => setTests(res.data))
      .catch((err: any) => setError(err?.response?.data?.message ?? "Failed to load tests."))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <section className="glass-surface rounded-3xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tests</p>
            <p className="text-xs text-slate-300">Start active tests, review attempted ones, and resume in-progress exams.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RotateCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {error && <p className="mt-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">{error}</p>}

        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-3xl bg-slate-900/80 px-4 py-4">
                <div className="h-4 w-1/2 rounded-full bg-slate-800/80" />
                <div className="mt-3 h-3 w-3/4 rounded-full bg-slate-800/80" />
              </div>
            ))
          ) : tests.length === 0 ? (
            <div className="rounded-3xl bg-slate-900/80 px-4 py-6 text-center text-sm text-slate-400">
              No tests available right now.
            </div>
          ) : (
            tests.map((test) => {
              const state = getState(test);
              const attempt = test.myAttempt;
              return (
                <div key={test._id} className="rounded-3xl border border-slate-800 bg-slate-900/80 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-50">{test.title}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{test.description}</p>
                    </div>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                      state === "active"
                        ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                        : state === "upcoming"
                        ? "border border-sky-500/40 bg-sky-500/10 text-sky-200"
                        : state === "ended"
                        ? "border border-amber-500/40 bg-amber-500/10 text-amber-200"
                        : "border border-slate-600 bg-slate-800 text-slate-300"
                    )}>
                      {state}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div className="rounded-2xl bg-slate-950/60 px-3 py-2">
                      <p className="text-[10px] text-slate-500">Duration</p>
                      <p className="font-medium text-slate-50">{test.duration} min</p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/60 px-3 py-2">
                      <p className="text-[10px] text-slate-500">Marks</p>
                      <p className="font-medium text-slate-50">{test.totalMarks}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/60 px-3 py-2">
                      <p className="text-[10px] text-slate-500">Window</p>
                      <p className="font-medium text-slate-50">{new Date(test.startDateTime).toLocaleDateString()}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/60 px-3 py-2">
                      <p className="text-[10px] text-slate-500">Questions</p>
                      <p className="font-medium text-slate-50">{test.questions.length}</p>
                    </div>
                  </div>

                  {attempt && (
                    <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-300">
                      <p className="font-medium text-slate-50">Your progress</p>
                      <p className="mt-0.5 text-slate-400">
                        {attempt.status === "SUBMITTED" ? `Submitted · Score ${attempt.score ?? 0}` : `In progress · ${attempt.tabSwitchCount} tab switches`}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <CalendarRange className="h-3.5 w-3.5" />
                      {new Date(test.startDateTime).toLocaleString()}
                    </div>
                    {state === "active" ? (
                      <Button size="sm" onClick={() => navigate(ROUTES.studentTakeTest.replace(":testId", test._id))}>
                        <PlayCircle className="mr-2 h-4 w-4" />
                        {attempt?.status === "IN_PROGRESS" ? "Resume" : "Start"}
                      </Button>
                    ) : attempt?.status === "SUBMITTED" ? (
                      <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.studentTestResult.replace(":attemptId", attempt._id))}>
                        <FileCheck2 className="mr-2 h-4 w-4" />
                        View result
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        <Clock className="mr-2 h-4 w-4" />
                        Not available
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};