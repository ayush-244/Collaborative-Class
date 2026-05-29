export const ROUTES = {
  login: "/login",
  register: "/register",
  teacherRoot: "/teacher",
  studentRoot: "/student",
  teacherDashboard: "/teacher/dashboard",
  teacherDoubts: "/teacher/doubts",
  teacherMaterials: "/teacher/study-materials",
  teacherPeerSessions: "/teacher/peer-sessions",
  teacherAssignments: "/teacher/assignments",
  teacherTests: "/teacher/tests",
  teacherCreateTest: "/teacher/tests/create",
  studentDashboard: "/student/dashboard",
  studentDoubts: "/student/doubts",
  studentMaterials: "/student/study-materials",
  studentPeerSessions: "/student/peer-sessions",
  studentAssignments: "/student/assignments",
  studentTests: "/student/tests",
  studentTakeTest: "/student/tests/:testId",
  studentTestResult: "/student/tests/result/:attemptId"
} as const;

