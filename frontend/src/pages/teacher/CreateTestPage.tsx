import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, Save, Copy, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ROUTES } from "../../routes/paths";
import { TestsApi, type TestQuestionType } from "../../api/tests";

type QuestionForm = {
  type: TestQuestionType;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId?: string;
  correctAnswer: string;
  marks: string;
};

const genId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const emptyQuestion = (): QuestionForm => {
  const a = genId();
  const b = genId();
  return {
    type: "MCQ",
    prompt: "",
    options: [
      { id: a, text: "Option 1" },
      { id: b, text: "Option 2" },
    ],
    correctOptionId: a,
    correctAnswer: "",
    marks: "1",
  };
};

const toInputDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const CreateTestPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const [loading, setLoading] = React.useState(Boolean(editId));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [duration, setDuration] = React.useState("30");
  const [totalMarks, setTotalMarks] = React.useState("10");
  const [startDateTime, setStartDateTime] = React.useState("");
  const [endDateTime, setEndDateTime] = React.useState("");
  const [section, setSection] = React.useState("");
  const [questions, setQuestions] = React.useState<QuestionForm[]>([emptyQuestion()]);

  const totalMarksCalc = React.useMemo(() => {
    return questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
  }, [questions]);

  React.useEffect(() => {
    setTotalMarks(String(totalMarksCalc));
  }, [totalMarksCalc]);

  React.useEffect(() => {
    if (!editId) return;
    TestsApi.getById(editId)
      .then((res: { data: { title: string; description: string; duration: number; totalMarks: number; startDateTime: string; endDateTime: string; section: string; questions: Array<{ type: TestQuestionType; prompt: string; options: string[]; correctAnswer?: string; marks: number; }> } }) => {
        const test = res.data;
        setTitle(test.title);
        setDescription(test.description);
        setDuration(String(test.duration));
        setTotalMarks(String(test.totalMarks));
        setSection(test.section);
        setStartDateTime(toInputDateTime(test.startDateTime));
        setEndDateTime(toInputDateTime(test.endDateTime));
        setQuestions(
          test.questions.map((question) => {
            const opts = (question.options || []).map((opt: string) => ({ id: genId(), text: opt }));
            const matched = opts.find((o) => String(o.text).trim() === String(question.correctAnswer).trim());
            return {
              type: question.type,
              prompt: question.prompt,
              options: opts,
              correctOptionId: matched?.id,
              correctAnswer: question.correctAnswer ?? "",
              marks: String(question.marks),
            } as QuestionForm;
          })
        );
      })
        .catch((err: any) => setError(err?.response?.data?.message ?? "Failed to load test."))
      .finally(() => setLoading(false));
  }, [editId]);

  const updateQuestion = (index: number, patch: Partial<QuestionForm>) => {
    setQuestions((prev) => prev.map((question, currentIndex) => (currentIndex === index ? { ...question, ...patch } : question)));
  };

  const moveQuestion = (index: number, dir: number) => {
    setQuestions((prev) => {
      const copy = [...prev];
      const to = index + dir;
      if (to < 0 || to >= copy.length) return prev;
      const [item] = copy.splice(index, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  };

  const duplicateQuestion = (index: number) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy.splice(index + 1, 0, { ...prev[index] });
      return copy;
    });
  };

  const addOption = (qIndex: number) => {
    setQuestions((prev) => {
      const copy = [...prev];
      const q = { ...copy[qIndex] };
      q.options = q.options ? [...q.options, { id: genId(), text: `Option ${q.options.length + 1}` }] : [{ id: genId(), text: 'Option 1' }, { id: genId(), text: 'Option 2' }];
      copy[qIndex] = q;
      return copy;
    });
  };

  const updateOption = (qIndex: number, optionId: string, text: string) => {
    setQuestions((prev) => prev.map((q, i) => (i === qIndex ? { ...q, options: (q.options || []).map((o) => (o.id === optionId ? { ...o, text } : o)) } : q)));
  };

  const deleteOption = (qIndex: number, optionId: string) => {
    setQuestions((prev) => {
      const copy = [...prev];
      const q = { ...copy[qIndex] } as QuestionForm;
      if (!q.options || q.options.length <= 2) return prev; // ensure min 2
      q.options = q.options.filter((o) => o.id !== optionId);
      if (q.correctOptionId === optionId) q.correctOptionId = q.options[0]?.id;
      copy[qIndex] = q;
      return copy;
    });
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = "Test title is required";
    if (!section.trim()) errors.section = "Section is required";
    if (!duration || Number(duration) <= 0) errors.duration = "Duration must be greater than 0";
    if (!startDateTime) errors.startDateTime = "Start date & time required";
    if (!endDateTime) errors.endDateTime = "End date & time required";
    if (startDateTime && endDateTime && new Date(startDateTime) >= new Date(endDateTime)) errors.endDateTime = "End date must be after start date";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError("Please fix the highlighted fields.");
      return;
    }

    // Per-question validation
    questions.forEach((question, qi) => {
      if (question.type === "MCQ") {
        const opts = (question.options || []).map((o) => String(o.text || "").trim());
        if (opts.length < 2) errors[`q_${qi}_options`] = "Minimum 2 options required";
        if (opts.some((t) => !t)) errors[`q_${qi}_options`] = "Empty options are not allowed";
        const dup = opts.some((t, i) => opts.indexOf(t) !== i);
        if (dup) errors[`q_${qi}_options`] = "Duplicate options are not allowed";
        if (!question.correctOptionId || !(question.options || []).find((o) => o.id === question.correctOptionId)) errors[`q_${qi}_correct`] = "Select the correct answer";
      } else if (question.type === "SHORT_ANSWER") {
        if (!question.correctAnswer?.trim()) errors[`q_${qi}_correct`] = "Answer key required";
      }
    });

    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError("Please fix the highlighted fields.");
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim(),
      duration: Number(duration),
      totalMarks: Number(totalMarks),
      startDateTime,
      endDateTime,
      section: section.trim(),
      questions: questions.map((question, index) => ({
        type: question.type,
        prompt: question.prompt.trim(),
        options: question.type === "MCQ" ? (question.options || []).map((o) => String(o.text || "").trim()) : question.type === "TRUE_FALSE" ? ["True", "False"] : [],
        correctAnswer: question.type === "MCQ" ? ((question.options || []).find((o) => o.id === question.correctOptionId)?.text || "") : question.correctAnswer.trim(),
        marks: Number(question.marks),
        order: index,
      })),
    };

    setSaving(true);
    setError(null);
    try {
      if (editId) {
        await TestsApi.update(editId, payload);
      } else {
        await TestsApi.create(payload);
      }
      navigate(ROUTES.teacherTests);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to save test.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="glass-surface rounded-3xl p-6 text-sm text-slate-300">Loading test...</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{editId ? "Edit Test" : "Create Test"}</h1>
          <p className="mt-1 text-sm text-slate-400">Build timed quizzes with MCQ, True/False, and Short Answer questions.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.teacherTests)}>Back</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : editId ? "Update test" : "Create & Publish"}
          </Button>
        </div>
      </header>

      {error && <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p>}

      <section className="glass-surface rounded-3xl p-6">
        <h2 className="text-sm font-medium">Test Information</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2 text-sm">
          <div>
            <label className="mb-1 block text-xs text-slate-300">Test Title <span className="text-rose-400">*</span></label>
            <input aria-label="Test Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none" />
            {fieldErrors.title && <p className="mt-1 text-xs text-rose-300">{fieldErrors.title}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-300">Section</label>
            <input aria-label="Section" value={section} onChange={(e) => setSection(e.target.value)} className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none" />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-300">Duration (minutes) <span className="text-rose-400">*</span></label>
            <input value={duration} onChange={(e) => setDuration(e.target.value)} type="number" min="1" className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none" />
            {fieldErrors.duration && <p className="mt-1 text-xs text-rose-300">{fieldErrors.duration}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-300">Total Marks</label>
            <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50">{totalMarks}</div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-300">Start Date & Time <span className="text-rose-400">*</span></label>
            <input value={startDateTime} onChange={(e) => setStartDateTime(e.target.value)} type="datetime-local" className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none" />
            {fieldErrors.startDateTime && <p className="mt-1 text-xs text-rose-300">{fieldErrors.startDateTime}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-300">End Date & Time <span className="text-rose-400">*</span></label>
            <input value={endDateTime} onChange={(e) => setEndDateTime(e.target.value)} type="datetime-local" className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none" />
            {fieldErrors.endDateTime && <p className="mt-1 text-xs text-rose-300">{fieldErrors.endDateTime}</p>}
          </div>

          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-slate-300">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full min-h-[88px] rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none" />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Questions</h3>
            <p className="mt-1 text-xs text-slate-400">Add questions, set marks, and pick the correct answer.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}>
              <Plus className="mr-2 h-4 w-4" />
              Add question
            </Button>
            <div className="text-sm text-slate-400">Total marks: <span className="font-medium text-slate-100">{totalMarksCalc}</span></div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {questions.map((question, index) => (
            <div key={index} className="glass-surface rounded-3xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-50">Question {index + 1}</p>
                  <p className="text-xs text-slate-400">Type: {question.type} • Marks: {question.marks || 0}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button title="Duplicate" className="text-slate-400 hover:text-slate-200" onClick={() => duplicateQuestion(index)}><Copy className="h-4 w-4" /></button>
                  <button title="Move up" className="text-slate-400 hover:text-slate-200" onClick={() => moveQuestion(index, -1)}><ArrowUp className="h-4 w-4" /></button>
                  <button title="Move down" className="text-slate-400 hover:text-slate-200" onClick={() => moveQuestion(index, 1)}><ArrowDown className="h-4 w-4" /></button>
                  {questions.length > 1 && (
                    <button title="Delete" className="text-rose-400 hover:text-rose-200" onClick={() => setQuestions((prev) => prev.filter((_, qIndex) => qIndex !== index))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2 text-sm">
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Question Type</label>
                  <select value={question.type} onChange={(e) => {
                    const type = e.target.value as TestQuestionType;
                    if (type === "MCQ") {
                      updateQuestion(index, { type, options: question.options && question.options.length >= 2 ? question.options : [{ id: genId(), text: 'Option 1' }, { id: genId(), text: 'Option 2' }], correctOptionId: question.options && question.options.length ? question.options[0].id : undefined, correctAnswer: '' });
                    } else if (type === "TRUE_FALSE") {
                      const t = genId();
                      const f = genId();
                      updateQuestion(index, { type, options: [{ id: t, text: 'True' }, { id: f, text: 'False' }], correctOptionId: t, correctAnswer: 'True' });
                    } else {
                      updateQuestion(index, { type, options: [], correctOptionId: undefined, correctAnswer: '' });
                    }
                  }} className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none">
                    <option value="MCQ">MCQ</option>
                    <option value="TRUE_FALSE">True / False</option>
                    <option value="SHORT_ANSWER">Short Answer</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-300">Marks</label>
                  <input value={question.marks} onChange={(e) => updateQuestion(index, { marks: e.target.value })} type="number" min="1" className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none" />
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs text-slate-300">Question</label>
                  <textarea value={question.prompt} onChange={(e) => updateQuestion(index, { prompt: e.target.value })} className="w-full min-h-[80px] rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none" />
                </div>

                {question.type === "MCQ" && (
                  <div className="lg:col-span-2">
                    <label className="mb-1 block text-xs text-slate-300">Options</label>
                    <div className="space-y-2">
                      {(question.options || []).map((opt, oIndex) => (
                        <div key={opt.id} className="flex items-center gap-2">
                          <div className="w-6 text-xs text-slate-300">{String.fromCharCode(65 + oIndex)}</div>
                          <input value={opt.text} onChange={(e) => updateOption(index, opt.id, e.target.value)} className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none" />
                          <label className="text-xs text-slate-300">Correct</label>
                          <input type="radio" name={`correct-${index}`} checked={question.correctOptionId === opt.id} onChange={() => updateQuestion(index, { correctOptionId: opt.id })} />
                          <button className="text-rose-400 hover:text-rose-200" onClick={() => deleteOption(index, opt.id)} disabled={(question.options || []).length <= 2}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2">
                      <Button variant="outline" size="sm" onClick={() => addOption(index)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add option
                      </Button>
                    </div>
                  </div>
                )}

                {question.type === "TRUE_FALSE" && (
                  <div className="lg:col-span-2">
                    <label className="mb-1 block text-xs text-slate-300">Correct Answer</label>
                    <select value={question.correctAnswer} onChange={(e) => updateQuestion(index, { correctAnswer: e.target.value })} className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none">
                      <option value="True">True</option>
                      <option value="False">False</option>
                    </select>
                  </div>
                )}

                {question.type === "SHORT_ANSWER" && (
                  <div className="lg:col-span-2">
                    <label className="mb-1 block text-xs text-slate-300">Answer Key</label>
                    <input value={question.correctAnswer} onChange={(e) => updateQuestion(index, { correctAnswer: e.target.value })} className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 outline-none" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-surface rounded-3xl p-4">
        <h3 className="text-sm font-medium">Review</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-slate-900/60 p-3">Total Questions<div className="text-lg font-medium mt-1">{questions.length}</div></div>
          <div className="rounded-2xl bg-slate-900/60 p-3">Total Marks<div className="text-lg font-medium mt-1">{totalMarksCalc}</div></div>
          <div className="rounded-2xl bg-slate-900/60 p-3">Duration<div className="text-lg font-medium mt-1">{duration} minutes</div></div>
          <div className="rounded-2xl bg-slate-900/60 p-3">Window<div className="text-sm mt-1">{startDateTime ? new Date(startDateTime).toLocaleString() : '-'} → {endDateTime ? new Date(endDateTime).toLocaleString() : '-'}</div></div>
        </div>
      </section>
    </div>
  );
};