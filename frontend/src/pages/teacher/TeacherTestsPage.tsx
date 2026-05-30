import React from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Play, Trash2, PencilLine, BarChart3, Users, ShieldAlert } from "lucide-react";
import { Button } from "../../components/ui/button";
import { RegNoBadge } from "../../components/ui/RegNoBadge";
import { cn } from "../../utils/cn";
import { ROUTES } from "../../routes/paths";
import { TestsApi, type TeacherTestSummary, type TestListItem } from "../../api/tests";

export const TeacherTestsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tests, setTests] = React.useState<TestListItem[]>([]);
  const [summary, setSummary] = React.useState<TeacherTestSummary | null>(null);
  const [attempts, setAttempts] = React.useState<any[]>([]);
  const [selected, setSelected] = React.useState<TestListItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [testsRes, summaryRes] = await Promise.all([
        TestsApi.list(),
        TestsApi.teacherSummary(),
      ]);
      setTests(testsRes.data);
      setSummary(summaryRes.data);
      if (testsRes.data.length > 0) {
        setSelected(testsRes.data[0]);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to load tests.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!selected?._id) return;
    setDetailLoading(true);
    TestsApi.attempts(selected._id)
      .then((res: { data: any[] }) => setAttempts(res.data))
      .catch(() => setAttempts([]))
      .finally(() => setDetailLoading(false));
  }, [selected?._id]);

  const handlePublish = async (id: string) => {
    await TestsApi.publish(id);
    await load();
  };

  const handleDelete = async (id: string) => {
    await TestsApi.remove(id);
    await load();
  };

  return (
    <div className="space-y-4">
      <section className="glass-surface rounded-3xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tests</p>
            <p className="text-xs text-slate-300">Create, publish, and review timed quizzes with tab-violation tracking.</p>
          </div>
          <Button size="sm" onClick={() => navigate(ROUTES.teacherCreateTest)}>
            <Plus className="mr-2 h-4 w-4" />
            Create test
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6 text-[11px]">
          {[
            { label: "Total tests", value: summary?.totalTests ?? 0, tone: "sky" },
            { label: "Total attempts", value: summary?.totalAttempts ?? 0, tone: "emerald" },
            { label: "Average score", value: summary ? summary.averageScore.toFixed(1) : "0.0", tone: "amber" },
            { label: "Highest score", value: summary?.highestScore ?? 0, tone: "rose" },
            { label: "Violation students", value: summary?.studentsWithViolations ?? 0, tone: "violet" },
            { label: "Auto-submitted", value: summary?.autoSubmittedTests ?? 0, tone: "orange" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-slate-900/80 px-3 py-3">
              <p className="text-[10px] text-slate-400">{item.label}</p>
              <p className={cn("mt-1 text-lg font-semibold text-slate-50")}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl bg-slate-950/70 p-3">
            <p className="text-xs font-medium text-slate-50">Top scorers</p>
            <div className="mt-2 space-y-1.5 text-[11px] text-slate-300">
              {(summary?.topScorers ?? []).slice(0, 5).map((row, index) => (
                <div key={`${row.studentId}-${row.testId}`} className="flex items-center justify-between rounded-xl bg-slate-900/80 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{index + 1}. {row.studentName}</span>
                      {row.studentRegNo && <RegNoBadge regNo={row.studentRegNo} />}
                    </div>
                  </div>
                  <span className="shrink-0 ml-2">{row.score}</span>
                </div>
              ))}
              {!summary?.topScorers?.length && <p className="text-slate-400">No scores yet.</p>}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-950/70 p-3">
            <p className="text-xs font-medium text-slate-50">Violation leaderboard</p>
            <div className="mt-2 space-y-1.5 text-[11px] text-slate-300">
              {(summary?.violationLeaderboard ?? []).slice(0, 5).map((row, index) => (
                <div key={row.studentId} className="flex items-center justify-between rounded-xl bg-slate-900/80 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{index + 1}. {row.studentName}</span>
                      {row.studentRegNo && <RegNoBadge regNo={row.studentRegNo} />}
                    </div>
                  </div>
                  <span className="shrink-0 ml-2">{row.violations}</span>
                </div>
              ))}
              {!summary?.violationLeaderboard?.length && <p className="text-slate-400">No violations yet.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="glass-surface rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Your tests</p>
              <p className="text-xs text-slate-300">Select a test to review attempts and anti-cheat violations.</p>
            </div>
            {loading && <p className="text-[10px] text-slate-400">Loading...</p>}
          </div>

          {error && <p className="mb-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">{error}</p>}

          <div className="space-y-2">
            {tests.map((test) => (
              <button
                key={test._id}
                onClick={() => setSelected(test)}
                className={cn(
                  "w-full rounded-2xl border px-3 py-3 text-left transition",
                  selected?._id === test._id
                    ? "border-sky-500/60 bg-sky-500/10"
                    : "border-slate-800 bg-slate-900/70 hover:bg-slate-900/90"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-50">{test.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {test.section} · {test.duration} min · {test.totalMarks} marks
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
                    {test.status}
                  </span>
                </div>
              </button>
            ))}
            {!loading && tests.length === 0 && (
              <div className="rounded-2xl bg-slate-900/80 px-3 py-6 text-center text-xs text-slate-400">
                No tests created yet.
              </div>
            )}
          </div>
        </div>

        <div className="glass-surface rounded-3xl p-4">
          {!selected ? (
            <div className="rounded-2xl bg-slate-900/80 px-3 py-6 text-center text-xs text-slate-400">
              Select a test to inspect attempts.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Selected test</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-50">{selected.title}</h2>
                <p className="mt-1 text-xs text-slate-300">{selected.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-2xl bg-slate-900/80 px-3 py-2.5">
                  <p className="text-[10px] text-slate-400">Questions</p>
                  <p className="text-sm font-semibold text-slate-50">{selected.questions.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-900/80 px-3 py-2.5">
                  <p className="text-[10px] text-slate-400">Window</p>
                  <p className="text-sm font-semibold text-slate-50">{new Date(selected.startDateTime).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate(`${ROUTES.teacherCreateTest}?edit=${selected._id}`)}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => void handlePublish(selected._id)} disabled={selected.status === "published"}>
                  <Play className="mr-2 h-4 w-4" />
                  Publish
                </Button>
                <Button variant="outline" size="sm" onClick={() => void handleDelete(selected._id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-50">Student attempts</p>
                    <p className="text-[10px] text-slate-400">Scores, submission times, and tab switch violations.</p>
                  </div>
                  {detailLoading && <p className="text-[10px] text-slate-400">Refreshing...</p>}
                </div>
                <div className="space-y-2 max-h-[340px] overflow-y-auto scroll-thin">
                  {attempts.length === 0 ? (
                    <div className="rounded-2xl bg-slate-900/80 px-3 py-4 text-[11px] text-slate-400">
                      No attempts yet.
                    </div>
                  ) : (
                    attempts.map((attempt) => (
                      <div key={attempt._id} className="rounded-2xl bg-slate-900/80 px-3 py-2.5 text-[11px] text-slate-300">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-50 truncate">{attempt.studentId?.name ?? "Student"}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {attempt.studentId?.regNo && <RegNoBadge regNo={attempt.studentId.regNo} />}
                              <p className="text-[10px] text-slate-400 truncate">{attempt.studentId?.email}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold text-slate-50">{attempt.score ?? 0} / {selected.totalMarks}</p>
                            <p className="text-[10px] text-slate-400">{attempt.autoSubmitted ? "Auto-submitted" : "Submitted"}</p>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-slate-400">
                          <span>Submitted: {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "In progress"}</span>
                          <span>Violations: {attempt.tabSwitchCount}</span>
                          <span>Status: {attempt.status}</span>
                        </div>
                        {attempt.violations?.length ? (
                          <div className="mt-2 rounded-xl bg-slate-950/60 px-3 py-2 text-[10px] text-slate-400">
                            {attempt.violations.slice(-3).map((violation: { reason: string; timestamp: string }, idx: number) => (
                              <div key={`${violation.timestamp}-${idx}`}>
                                {new Date(violation.timestamp).toLocaleString()} · {violation.reason}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};