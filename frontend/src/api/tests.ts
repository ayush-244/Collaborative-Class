import { api, tokenStorage } from "./axios";

export type TestQuestionType = "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER";

export interface TestQuestion {
  _id: string;
  type: TestQuestionType;
  prompt: string;
  options: string[];
  correctAnswer?: string;
  marks: number;
  order: number;
}

export interface TestAttemptAnswer {
  questionId: string;
  questionType: TestQuestionType;
  selectedOption?: string;
  textAnswer?: string;
  isCorrect?: boolean;
  marksAwarded?: number;
}

export interface TestAttempt {
  _id: string;
  studentId: {
    _id: string;
    name: string;
    email: string;
    section?: string;
  };
  testId: string;
  answers: TestAttemptAnswer[];
  score: number | null;
  startedAt: string;
  submittedAt: string | null;
  expiresAt: string;
  tabSwitchCount: number;
  autoSubmitted: boolean;
  status: "IN_PROGRESS" | "SUBMITTED";
  lastSavedAt?: string;
  ipAddress?: string;
  browserInfo?: string;
  violations?: Array<{
    reason: string;
    timestamp: string;
  }>;
}

export interface TestListItem {
  _id: string;
  title: string;
  description: string;
  section: string;
  duration: number;
  totalMarks: number;
  startDateTime: string;
  endDateTime: string;
  status: "draft" | "published" | "closed";
  publishedAt?: string | null;
  createdBy?: {
    _id: string;
    name: string;
    role: string;
    section?: string;
  };
  questions: TestQuestion[];
  myAttempt?: {
    _id: string;
    score: number | null;
    submittedAt: string | null;
    status: "IN_PROGRESS" | "SUBMITTED";
    tabSwitchCount: number;
    autoSubmitted: boolean;
    startedAt: string;
    expiresAt: string;
  } | null;
}

export interface TeacherTestSummary {
  totalTests: number;
  totalAttempts: number;
  averageScore: number;
  highestScore: number;
  passRate?: number;
  failRate?: number;
  studentsWithViolations: number;
  autoSubmittedTests: number;
  topScorers?: Array<{
    studentId: string;
    studentName: string;
    testId: string;
    score: number;
  }>;
  violationLeaderboard?: Array<{
    studentId: string;
    studentName: string;
    violations: number;
  }>;
}

export interface TestDetail extends TestListItem {}

export interface StartAttemptResponse {
  test: TestDetail;
  attempt: TestAttempt;
  remainingSeconds: number;
}

export interface CreateTestPayload {
  title: string;
  description?: string;
  duration: number;
  totalMarks: number;
  startDateTime: string;
  endDateTime: string;
  section: string;
  questions: Array<{
    type: TestQuestionType;
    prompt: string;
    options?: string[];
    correctAnswer: string;
    marks: number;
    order?: number;
  }>;
}

export const TestsApi: {
  list: () => ReturnType<typeof api.get<TestListItem[]>>;
  getById: (id: string) => ReturnType<typeof api.get<TestDetail>>;
  create: (payload: CreateTestPayload) => ReturnType<typeof api.post<TestDetail>>;
  update: (id: string, payload: Partial<CreateTestPayload>) => ReturnType<typeof api.patch<TestDetail>>;
  remove: (id: string) => ReturnType<typeof api.delete<{ message: string }>>;
  publish: (id: string) => ReturnType<typeof api.patch<{ message: string }>>;
  close: (id: string) => ReturnType<typeof api.patch<{ message: string }>>;
  teacherSummary: () => ReturnType<typeof api.get<TeacherTestSummary>>;
  summary: (id: string) => ReturnType<typeof api.get<TeacherTestSummary>>;
  attempts: (id: string) => ReturnType<typeof api.get<TestAttempt[]>>;
  startAttempt: (id: string) => ReturnType<typeof api.get<StartAttemptResponse>>;
  getAttempt: (attemptId: string) => ReturnType<typeof api.get<{ test: TestDetail; remainingSeconds: number } & TestAttempt>>;
  saveAnswers: (attemptId: string, answers: TestAttemptAnswer[]) => ReturnType<typeof api.patch<{ message: string; remainingSeconds: number }>>;
  recordTabSwitch: (attemptId: string) => ReturnType<typeof api.post<{
    tabSwitchCount: number;
    remainingAttempts: number;
    autoSubmitted: boolean;
    message: string;
    submitted: boolean;
    submitResult?: { attempt: TestAttempt; score: number; autoSubmitted: boolean };
  }>>;
  submitAttempt: (attemptId: string, autoSubmitted?: boolean) => ReturnType<typeof api.patch<{ attempt: TestAttempt; remainingSeconds: number; score: number; autoSubmitted: boolean }>>;
  recordViolation: (attemptId: string, reason: string) => Promise<{ data: {
    tabSwitchCount: number;
    remainingAttempts: number;
    autoSubmitted: boolean;
    message: string;
    submitted: boolean;
    reason: string;
    submitResult?: { attempt: TestAttempt; score: number; autoSubmitted: boolean };
  } }>;
} = {
  list: () => api.get<TestListItem[]>("/tests"),

  getById: (id: string) => api.get<TestDetail>(`/tests/${id}`),

  create: (payload: CreateTestPayload) => api.post<TestDetail>("/tests", payload),

  update: (id: string, payload: Partial<CreateTestPayload>) =>
    api.patch<TestDetail>(`/tests/${id}`, payload),

  remove: (id: string) => api.delete<{ message: string }>(`/tests/${id}`),

  publish: (id: string) => api.patch<{ message: string }>(`/tests/${id}/publish`),

  close: (id: string) => api.patch<{ message: string }>(`/tests/${id}/close`),

  teacherSummary: () => api.get<TeacherTestSummary>("/tests/teacher/summary"),

  summary: (id: string) =>
    api.get<TeacherTestSummary>(`/tests/${id}/summary`),

  attempts: (id: string) => api.get<TestAttempt[]>(`/tests/${id}/attempts`),

  startAttempt: (id: string) => api.get<StartAttemptResponse>(`/tests/${id}/start`),

  getAttempt: (attemptId: string) =>
    api.get<{ test: TestDetail; remainingSeconds: number } & TestAttempt>(
      `/tests/attempts/${attemptId}`
    ),

  saveAnswers: (attemptId: string, answers: TestAttemptAnswer[]) =>
    api.patch<{ message: string; remainingSeconds: number }>(
      `/tests/attempts/${attemptId}/answers`,
      { answers }
    ),

  recordTabSwitch: (attemptId: string) =>
    api.post<{
      tabSwitchCount: number;
      remainingAttempts: number;
      autoSubmitted: boolean;
      message: string;
      submitted: boolean;
      submitResult?: { attempt: TestAttempt; score: number; autoSubmitted: boolean };
    }>(`/tests/attempts/${attemptId}/tab-switch`),

  submitAttempt: (attemptId: string, autoSubmitted = false) =>
    api.patch<{ attempt: TestAttempt; remainingSeconds: number; score: number; autoSubmitted: boolean }>(
      `/tests/attempts/${attemptId}/submit`,
      { autoSubmitted }
    ),

  recordViolation: async (attemptId: string, reason: string) => {
    const token = tokenStorage.get();
    const response = await fetch(`/api/tests/attempts/${attemptId}/tab-switch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ reason }),
      keepalive: true
    });

    const data = (await response.json()) as {
      tabSwitchCount: number;
      remainingAttempts: number;
      autoSubmitted: boolean;
      message: string;
      submitted: boolean;
      reason: string;
      submitResult?: { attempt: TestAttempt; score: number; autoSubmitted: boolean };
    };

    return { data };
  },
};