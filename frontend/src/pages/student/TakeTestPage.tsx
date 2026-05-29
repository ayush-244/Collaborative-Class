import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Clock, Save, Send } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ROUTES } from "../../routes/paths";
import { TestsApi, type TestAttemptAnswer, type TestDetail, type TestQuestion } from "../../api/tests";
import { useSocket } from "../../context/SocketContext";
import { cn } from "../../utils/cn";

type AnswerMap = Record<string, { selectedOption?: string; textAnswer?: string }>;

const emptyMapFromTest = (test?: TestDetail | null, existing?: TestAttemptAnswer[]) => {
  const map: AnswerMap = {};
  (test?.questions ?? []).forEach((question) => {
    map[question._id] = { selectedOption: "", textAnswer: "" };
  });
  (existing ?? []).forEach((answer) => {
    map[answer.questionId] = {
      selectedOption: answer.selectedOption ?? "",
      textAnswer: answer.textAnswer ?? "",
    };
  });
  return map;
};

const toPayload = (answers: AnswerMap, test?: TestDetail | null): TestAttemptAnswer[] =>
  (test?.questions ?? []).map((question) => ({
    questionId: question._id,
    questionType: question.type,
    selectedOption: answers[question._id]?.selectedOption ?? "",
    textAnswer: answers[question._id]?.textAnswer ?? "",
  }));

export const TakeTestPage: React.FC = () => {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [test, setTest] = React.useState<TestDetail | null>(null);
  const [attemptId, setAttemptId] = React.useState<string | null>(null);
  const [answers, setAnswers] = React.useState<AnswerMap>({});
  const [remainingSeconds, setRemainingSeconds] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const violationLockRef = React.useRef(false);
  const autoSaveRef = React.useRef<number | null>(null);
  const timerRef = React.useRef<number | null>(null);

    const [markedForReview, setMarkedForReview] = React.useState<string[]>([]);
    const [activeQuestionIndex, setActiveQuestionIndex] = React.useState(0);
    const syncAnswers = React.useCallback(
      async (payloadAnswers: AnswerMap) => {
        if (!attemptId) return;
        setSaving(true);
        try {
          await TestsApi.saveAnswers(attemptId, toPayload(payloadAnswers, test));
        } catch {
          // non-fatal; the server keeps attempt state
        } finally {
          setSaving(false);
        }
      },
      [attemptId, test]
    );

  const submit = React.useCallback(async (autoSubmitted = false) => {
    if (!attemptId || submitting || submitted) return;
    setSubmitting(true);
    try {
      const res = await TestsApi.submitAttempt(attemptId, autoSubmitted);
      setSubmitted(true);
      navigate(ROUTES.studentTestResult.replace(":attemptId", res.data.attempt._id), { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to submit test.");
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, navigate, submitted, submitting]);

  const recordViolation = React.useCallback(async () => {
    if (!attemptId || submitted || submitting) return;

    try {
      let response:
        | { tabSwitchCount: number; remainingAttempts: number; autoSubmitted: boolean; message: string; submitted: boolean; submitResult?: any }
        | undefined;

      if (socket?.connected) {
        response = await new Promise((resolve) => {
          socket.emit("test_tab_switch", { attemptId }, (ack: any) => resolve(ack));
        });
      } else {
        const res = await TestsApi.recordTabSwitch(attemptId);
        response = res.data;
      }

      if (!response) return;
      setNotice(response.message);

      if (response.autoSubmitted && response.submitted) {
        setSubmitted(true);
        if (response.submitResult?.attempt?._id) {
          navigate(ROUTES.studentTestResult.replace(":attemptId", response.submitResult.attempt._id), { replace: true });
        }
      }
    } catch {
      setNotice("Tab switch detected, but tracking failed to sync.");
    }
  }, [attemptId, navigate, socket, submitted, submitting]);

  React.useEffect(() => {
    if (!testId) return;
    setLoading(true);
    TestsApi.startAttempt(testId)
      .then((res: { data: { test: TestDetail; attempt: { _id: string; status: "IN_PROGRESS" | "SUBMITTED"; answers: TestAttemptAnswer[] }; remainingSeconds: number } }) => {
        const payload = res.data;
        if (payload.attempt.status === "SUBMITTED") {
          navigate(ROUTES.studentTestResult.replace(":attemptId", payload.attempt._id), { replace: true });
          return;
        }
        setTest(payload.test);
        setAttemptId(payload.attempt._id);
        setRemainingSeconds(payload.remainingSeconds);
        setAnswers(emptyMapFromTest(payload.test, payload.attempt.answers));
      })
      .catch((err: any) => setError(err?.response?.data?.message ?? "Failed to load test."))
      .finally(() => setLoading(false));
  }, [navigate, testId]);

  React.useEffect(() => {
    if (!attemptId) return;
    if (remainingSeconds <= 0) {
      void submit(true);
      return;
    }

    timerRef.current = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          void submit(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [attemptId, remainingSeconds, submit]);

  React.useEffect(() => {
    if (!attemptId) return;
    if (autoSaveRef.current) window.clearTimeout(autoSaveRef.current);
    autoSaveRef.current = window.setTimeout(() => {
      void syncAnswers(answers);
    }, 800);
    return () => {
      if (autoSaveRef.current) window.clearTimeout(autoSaveRef.current);
    };
  }, [answers, attemptId, syncAnswers]);

  React.useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden && !violationLockRef.current) {
        violationLockRef.current = true;
        void recordViolation();
      }
      if (!document.hidden) {
        violationLockRef.current = false;
      }
    };

    const onBlur = () => {
      if (!violationLockRef.current) {
        violationLockRef.current = true;
        void recordViolation();
      }
    };

    const onFocus = () => {
      violationLockRef.current = false;
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [recordViolation]);

  const updateChoice = (questionId: string, value: string) => {
    setAnswers((current) => ({ ...current, [questionId]: { ...(current[questionId] ?? {}), selectedOption: value } }));
  };

  const updateText = (questionId: string, value: string) => {
    setAnswers((current) => ({ ...current, [questionId]: { ...(current[questionId] ?? {}), textAnswer: value } }));
  };

  const manualSave = async () => {
    if (!attemptId) return;
    setSaving(true);
    try {
      await TestsApi.saveAnswers(attemptId, toPayload(answers, test));
      setNotice("Progress saved.");
    } finally {
      setSaving(false);
    }
  };

  const renderQuestion = (question: TestQuestion, index: number) => (
    <div key={question._id} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Question {index + 1}</p>
          <p className="mt-1 text-sm font-medium text-slate-50">{question.prompt}</p>
        </div>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">{question.marks} marks</span>
      </div>

      {question.type === "MCQ" && (
        <div className="space-y-2">
          {question.options.map((option) => (
            <button key={option} onClick={() => updateChoice(question._id, option)} className={cn("w-full rounded-2xl border px-3 py-2 text-left text-xs transition", answers[question._id]?.selectedOption === option ? "border-sky-500/60 bg-sky-500/10 text-slate-50" : "border-slate-800 bg-slate-950/60 text-slate-300 hover:bg-slate-900")}>{option}</button>
          ))}
        </div>
      )}

      {question.type === "TRUE_FALSE" && (
        <div className="grid grid-cols-2 gap-2">
          {["True", "False"].map((option) => (
            <button key={option} onClick={() => updateChoice(question._id, option)} className={cn("rounded-2xl border px-3 py-2 text-xs transition", answers[question._id]?.selectedOption === option ? "border-emerald-500/60 bg-emerald-500/10 text-slate-50" : "border-slate-800 bg-slate-950/60 text-slate-300 hover:bg-slate-900")}>{option}</button>
          ))}
        </div>
      )}

      {question.type === "SHORT_ANSWER" && (
        <textarea value={answers[question._id]?.textAnswer ?? ""} onChange={(e) => updateText(question._id, e.target.value)} rows={4} placeholder="Type your answer here" className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-50 outline-none placeholder:text-slate-500" />
      )}
    </div>
  );

  if (loading) {
    return <div className="glass-surface rounded-3xl p-6 text-sm text-slate-300">Loading test...</div>;
  }

  if (!test) {
    return <div className="glass-surface rounded-3xl p-6 text-sm text-slate-300">{error ?? "Test not available."}</div>;
  }

  return (
    <div className="space-y-4">
      <section className="glass-surface rounded-3xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Taking test</p>
            <h1 className="text-lg font-semibold text-slate-50">{test.title}</h1>
            <p className="mt-1 text-xs text-slate-300">{test.description}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Time left</p>
            <p className={cn("text-2xl font-semibold", remainingSeconds <= 60 ? "text-rose-300" : "text-slate-50")}>{Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}</p>
          </div>
        </div>

        {notice && <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">{notice}</div>}
        {error && <div className="mt-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">{error}</div>}

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-3">
            {test.questions.map(renderQuestion)}
          </div>

          <div className="space-y-3">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-[11px] text-slate-300">
              <p className="font-medium text-slate-50">Instructions</p>
              <ul className="mt-2 space-y-1 text-slate-400">
                <li>• Save progress is automatic while you answer.</li>
                <li>• Switching tabs more than 3 times auto-submits the test.</li>
                <li>• Timer is persisted on the server and restored on refresh.</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-[11px] text-slate-300">
              <p className="font-medium text-slate-50">Anti-cheating state</p>
              <p className="mt-1 text-slate-400">The browser tab detector listens to visibility changes and window blur/focus events.</p>
            </div>

            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={manualSave} disabled={saving || submitting}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save progress"}
              </Button>
              <Button onClick={() => void submit(false)} disabled={submitting}>
                <Send className="mr-2 h-4 w-4" />
                {submitting ? "Submitting..." : "Submit test"}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 text-[10px] text-slate-500">
          Auto-save, timer sync, and anti-cheat events are kept on the backend so a refresh does not reset the attempt.
        </div>
      </section>
    </div>
  );
};