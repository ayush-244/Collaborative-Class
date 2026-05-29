const Test = require("../models/Test");
const Question = require("../models/Question");
const TestAttempt = require("../models/TestAttempt");
const { getIO } = require("../socket/ioInstance");

const TAB_SWITCH_LIMIT = 3;
const QUESTION_TYPES = ["MCQ", "TRUE_FALSE", "SHORT_ANSWER"];

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const getBrowserInfo = (req) => req.headers["user-agent"] || "";

const getIpAddress = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
  req.ip ||
  req.socket?.remoteAddress ||
  "";

const logAttemptDetail = (message, details = {}) => {
  console.log(`[TestAttemptDetail] ${message}`, details);
};

const getRemainingSeconds = (attempt) =>
  Math.max(0, Math.ceil((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000));

const mapQuestionForStudent = (question) => ({
  _id: question._id,
  type: question.type,
  prompt: question.prompt,
  options: question.options,
  marks: question.marks,
  order: question.order,
});

const mapQuestionForTeacher = (question) => ({
  _id: question._id,
  type: question.type,
  prompt: question.prompt,
  options: question.options,
  correctAnswer: question.correctAnswer,
  marks: question.marks,
  order: question.order,
});

const validateQuestionPayload = (question, index) => {
  if (!question?.type || !QUESTION_TYPES.includes(question.type)) {
    throw new Error(`Question ${index + 1}: invalid type`);
  }
  if (!question?.prompt?.trim()) {
    throw new Error(`Question ${index + 1}: prompt is required`);
  }
  if (!question?.correctAnswer?.trim()) {
    throw new Error(`Question ${index + 1}: correct answer is required`);
  }
  if (!Number.isFinite(Number(question?.marks)) || Number(question.marks) <= 0) {
    throw new Error(`Question ${index + 1}: marks must be greater than 0`);
  }
  if (question.type === "MCQ" && (!Array.isArray(question.options) || question.options.length < 2)) {
    throw new Error(`Question ${index + 1}: MCQ needs at least 2 options`);
  }
  if (question.type === "TRUE_FALSE") {
    const allowed = ["true", "false"];
    if (!allowed.includes(normalizeText(question.correctAnswer))) {
      throw new Error(`Question ${index + 1}: true/false answer must be True or False`);
    }
  }
};

const createQuestions = async (testId, questions = []) => {
  const created = [];
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    validateQuestionPayload(question, index);
    created.push(
      await Question.create({
        test: testId,
        type: question.type,
        prompt: question.prompt.trim(),
        options: Array.isArray(question.options)
          ? question.options.map((option) => String(option).trim()).filter(Boolean)
          : [],
        correctAnswer: String(question.correctAnswer).trim(),
        marks: Number(question.marks),
        order: Number.isFinite(Number(question.order)) ? Number(question.order) : index,
      })
    );
  }
  return created;
};

const hydrateTest = async (test, includeAnswers = false) => {
  const populated = await Test.findById(test._id).populate({
    path: "questions",
    options: { sort: { order: 1, createdAt: 1 } },
  });

  const questions = (populated?.questions || []).map((question) =>
    includeAnswers ? mapQuestionForTeacher(question) : mapQuestionForStudent(question)
  );

  return {
    ...test.toObject(),
    questions,
  };
};

const scoreAttempt = (questionDocs, answers) => {
  const answerMap = new Map(
    (answers || []).map((answer) => [String(answer.questionId), answer])
  );

  let totalScore = 0;
  const scoredAnswers = questionDocs.map((question) => {
    const provided = answerMap.get(String(question._id)) || {};
    let isCorrect = false;

    if (question.type === "MCQ" || question.type === "TRUE_FALSE") {
      isCorrect =
        normalizeText(provided.selectedOption) === normalizeText(question.correctAnswer);
    } else {
      isCorrect =
        normalizeText(provided.textAnswer) === normalizeText(question.correctAnswer);
    }

    const marksAwarded = isCorrect ? Number(question.marks) : 0;
    totalScore += marksAwarded;

    return {
      questionId: question._id,
      questionType: question.type,
      selectedOption: String(provided.selectedOption || ""),
      textAnswer: String(provided.textAnswer || ""),
      isCorrect,
      marksAwarded,
    };
  });

  return { totalScore, scoredAnswers };
};

const getAccessibleTestsQuery = (req) => {
  if (req.user.role === "teacher") {
    return { createdBy: req.user._id };
  }
  return {
    section: req.user.section,
    status: "published",
  };
};

const createTest = async (req, res) => {
  try {
    const { title, description, duration, totalMarks, startDateTime, endDateTime, section, questions } = req.body;

    if (!title?.trim() || !section?.trim() || !duration || !totalMarks || !startDateTime || !endDateTime) {
      return res.status(400).json({ message: "All test fields are required" });
    }

    const parsedStart = new Date(startDateTime);
    const parsedEnd = new Date(endDateTime);

    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
      return res.status(400).json({ message: "Invalid start or end date" });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: "At least one question is required" });
    }

    const test = await Test.create({
      title: title.trim(),
      description: description?.trim() || "",
      duration: Number(duration),
      totalMarks: Number(totalMarks),
      startDateTime: parsedStart,
      endDateTime: parsedEnd,
      section: section.trim(),
      createdBy: req.user._id,
    });

    const questionDocs = await createQuestions(test._id, questions);
    test.questions = questionDocs.map((question) => question._id);
    await test.save();

    const hydrated = await hydrateTest(test, true);
    res.status(201).json(hydrated);
  } catch (error) {
    return res.status(400).json({ message: error.message || "Failed to create test" });
  }
};

const updateTest = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }
    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const hasAttempts = await TestAttempt.exists({ testId: test._id });
    const { title, description, duration, totalMarks, startDateTime, endDateTime, section, questions } = req.body;

    if (title !== undefined) test.title = String(title).trim();
    if (description !== undefined) test.description = String(description).trim();
    if (duration !== undefined) test.duration = Number(duration);
    if (totalMarks !== undefined) test.totalMarks = Number(totalMarks);
    if (startDateTime !== undefined) test.startDateTime = new Date(startDateTime);
    if (endDateTime !== undefined) test.endDateTime = new Date(endDateTime);
    if (section !== undefined) test.section = String(section).trim();

    if (questions !== undefined) {
      if (hasAttempts) {
        return res.status(400).json({ message: "Cannot change questions after attempts have started" });
      }
      await Question.deleteMany({ test: test._id });
      const questionDocs = await createQuestions(test._id, questions);
      test.questions = questionDocs.map((question) => question._id);
    }

    await test.save();
    const hydrated = await hydrateTest(test, true);
    res.json(hydrated);
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to update test" });
  }
};

const deleteTest = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }
    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await Question.deleteMany({ test: test._id });
    await TestAttempt.deleteMany({ testId: test._id });
    await Test.findByIdAndDelete(test._id);
    res.json({ message: "Test deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete test" });
  }
};

const publishTest = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }
    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }
    test.status = "published";
    test.publishedAt = new Date();
    await test.save();
    res.json({ message: "Test published successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to publish test" });
  }
};

const closeTest = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }
    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }
    test.status = "closed";
    await test.save();
    res.json({ message: "Test closed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to close test" });
  }
};

const listTests = async (req, res) => {
  try {
    const tests = await Test.find(getAccessibleTestsQuery(req))
      .sort({ startDateTime: -1, createdAt: -1 })
      .populate("createdBy", "name role section")
      .populate("questions");

    if (req.user.role === "student") {
      const attempts = await TestAttempt.find({ studentId: req.user._id }).select(
        "testId score submittedAt status tabSwitchCount autoSubmitted expiresAt startedAt"
      );
      const attemptMap = new Map(
        attempts.map((attempt) => [String(attempt.testId), attempt])
      );

      return res.json(
        tests.map((test) => {
          const attempt = attemptMap.get(String(test._id));
          return {
            ...test.toObject(),
            questions: (test.questions || []).map(mapQuestionForStudent),
            myAttempt: attempt
              ? {
                  _id: attempt._id,
                  score: attempt.score,
                  submittedAt: attempt.submittedAt,
                  status: attempt.status,
                  tabSwitchCount: attempt.tabSwitchCount,
                  autoSubmitted: attempt.autoSubmitted,
                  startedAt: attempt.startedAt,
                  expiresAt: attempt.expiresAt,
                }
              : null,
          };
        })
      );
    }

    res.json(
      tests.map((test) => ({
        ...test.toObject(),
        questions: (test.questions || []).map(mapQuestionForTeacher),
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to load tests" });
  }
};

const getTestById = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate("createdBy", "name role section")
      .populate("questions");

    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    if (req.user.role === "student") {
      if (test.section !== req.user.section) {
        return res.status(403).json({ message: "Access denied" });
      }
      return res.json({
        ...test.toObject(),
        questions: (test.questions || []).map(mapQuestionForStudent),
      });
    }

    if (test.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json({
      ...test.toObject(),
      questions: (test.questions || []).map(mapQuestionForTeacher),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load test" });
  }
};

const getTeacherAttempts = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }
    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const attempts = await TestAttempt.find({ testId: test._id })
      .sort({ submittedAt: -1, startedAt: -1 })
      .populate("studentId", "name email section");

    res.json(
      attempts.map((attempt) => ({
        _id: attempt._id,
        studentId: attempt.studentId,
        score: attempt.score,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        tabSwitchCount: attempt.tabSwitchCount,
        autoSubmitted: attempt.autoSubmitted,
        status: attempt.status,
        expiresAt: attempt.expiresAt,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to load attempts" });
  }
};

const getTeacherSummary = async (req, res) => {
  try {
    const tests = await Test.find({ createdBy: req.user._id }).select("_id");
    const testById = new Map(tests.map((test) => [String(test._id), test]));
    const testIds = tests.map((test) => test._id);

    const attempts = await TestAttempt.find({ testId: { $in: testIds } }).populate(
      "studentId",
      "name email section"
    );
    const totalAttempts = attempts.length;
    const scores = attempts.map((attempt) => attempt.score).filter((score) => Number.isFinite(score));
    const averageScore = scores.length ? scores.reduce((acc, score) => acc + score, 0) / scores.length : 0;
    const highestScore = scores.length ? Math.max(...scores) : 0;
    const passedAttempts = attempts.filter((attempt) => {
      const test = testById.get(String(attempt.testId));
      return test && Number.isFinite(attempt.score) && Number(attempt.score) >= Number(test.totalMarks || 0) * 0.5;
    }).length;
    const failedAttempts = totalAttempts - passedAttempts;
    const uniqueViolationStudents = new Set(
      attempts.filter((attempt) => attempt.tabSwitchCount > 0).map((attempt) => String(attempt.studentId))
    );
    const autoSubmitted = attempts.filter((attempt) => attempt.autoSubmitted).length;
    const topScorers = attempts
      .filter((attempt) => Number.isFinite(attempt.score))
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 5)
      .map((attempt) => ({
        studentId: attempt.studentId?._id ? String(attempt.studentId._id) : String(attempt.studentId),
        studentName: attempt.studentId?.name || "Student",
        testId: String(attempt.testId),
        score: Number(attempt.score || 0),
      }));

    const violationLeaderboard = Array.from(
      attempts.reduce((acc, attempt) => {
        const key = attempt.studentId?._id ? String(attempt.studentId._id) : String(attempt.studentId);
        const current = acc.get(key) || {
          studentId: key,
          studentName: attempt.studentId?.name || "Student",
          violations: 0,
        };
        current.violations += Number(attempt.tabSwitchCount || 0);
        acc.set(key, current);
        return acc;
      }, new Map()).values()
    )
      .sort((a, b) => b.violations - a.violations)
      .slice(0, 10);

    res.json({
      totalTests: testIds.length,
      totalAttempts,
      averageScore: Number(averageScore.toFixed(2)),
      highestScore,
      passRate: totalAttempts > 0 ? Number(((passedAttempts / totalAttempts) * 100).toFixed(2)) : 0,
      failRate: totalAttempts > 0 ? Number(((failedAttempts / totalAttempts) * 100).toFixed(2)) : 0,
      studentsWithViolations: uniqueViolationStudents.size,
      autoSubmittedTests: autoSubmitted,
      topScorers,
      violationLeaderboard,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load test analytics" });
  }
};

const startAttempt = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id).populate("questions");
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can start attempts" });
    }
    if (test.section !== req.user.section) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (test.status !== "published") {
      return res.status(400).json({ message: "Test is not available" });
    }

    const now = new Date();
    if (now < test.startDateTime || now > test.endDateTime) {
      return res.status(400).json({ message: "Test is outside the active window" });
    }

    let attempt = await TestAttempt.findOne({
      studentId: req.user._id,
      testId: test._id,
    });

    if (attempt && attempt.status === "SUBMITTED") {
      return res.status(200).json({
        test: {
          ...test.toObject(),
          questions: (test.questions || []).map(mapQuestionForStudent),
        },
        attempt,
        remainingSeconds: 0,
      });
    }

    if (!attempt) {
      attempt = await TestAttempt.create({
        studentId: req.user._id,
        testId: test._id,
        answers: [],
        startedAt: now,
        expiresAt: new Date(now.getTime() + Number(test.duration) * 60 * 1000),
        ipAddress: getIpAddress(req),
        browserInfo: getBrowserInfo(req),
      });
    }

    res.json({
      test: {
        ...test.toObject(),
        questions: (test.questions || []).map(mapQuestionForStudent),
      },
      attempt: {
        ...attempt.toObject(),
        violations: attempt.violations || [],
      },
      remainingSeconds: getRemainingSeconds(attempt),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await TestAttempt.findOne({
        studentId: req.user._id,
        testId: req.params.id,
        status: "IN_PROGRESS",
      });
      return res.json({
        test: null,
        attempt: existing,
        remainingSeconds: existing ? getRemainingSeconds(existing) : 0,
      });
    }
    res.status(500).json({ message: "Failed to start attempt" });
  }
};

const getAttemptById = async (req, res) => {
  try {
    const { attemptId } = req.params;
    logAttemptDetail("request received", {
      attemptId,
      userId: req.user?._id?.toString(),
      role: req.user?.role,
    });

    const attempt = await TestAttempt.findById(attemptId)
      .populate("studentId", "name email section")
      .populate({ path: "testId", populate: { path: "questions" } });

    logAttemptDetail("query completed", {
      attemptId,
      found: Boolean(attempt),
    });

    if (!attempt) {
      logAttemptDetail("attempt not found", { attemptId });
      return res.status(404).json({ message: "Attempt not found" });
    }

    const studentId = attempt.studentId?._id?.toString?.() || attempt.studentId?.toString?.();
    const testOwnerId = attempt.testId?.createdBy?.toString?.() || attempt.testId?.createdBy?.toString?.();
    const isOwner = studentId === req.user._id.toString();
    const isTeacherOwner =
      req.user.role === "teacher" &&
      testOwnerId === req.user._id.toString();

    logAttemptDetail("authorization evaluated", {
      attemptId,
      userId: req.user._id.toString(),
      role: req.user.role,
      studentId,
      testOwnerId,
      isOwner,
      isTeacherOwner,
    });

    if (!isOwner && !isTeacherOwner) {
      logAttemptDetail("access denied", {
        attemptId,
        userId: req.user._id.toString(),
        role: req.user.role,
      });
      return res.status(403).json({ message: "Access denied" });
    }

    const responseBody = {
      ...attempt.toObject(),
      violations: attempt.violations || [],
      test: {
        ...attempt.testId.toObject(),
        questions: (attempt.testId.questions || []).map(
          req.user.role === "teacher" ? mapQuestionForTeacher : mapQuestionForStudent
        ),
      },
      remainingSeconds: attempt.status === "IN_PROGRESS" ? getRemainingSeconds(attempt) : 0,
    };

    logAttemptDetail("response serialized", {
      attemptId,
      status: responseBody.status,
      tabSwitchCount: responseBody.tabSwitchCount,
      autoSubmitted: responseBody.autoSubmitted,
    });

    res.json(responseBody);
  } catch (error) {
    logAttemptDetail("request failed", {
      attemptId: req.params?.attemptId,
      message: error.message,
    });
    res.status(500).json({ message: "Failed to load attempt" });
  }
};

const saveAttemptAnswers = async (req, res) => {
  try {
    const { answers } = req.body;
    const attempt = await TestAttempt.findById(req.params.attemptId);
    if (!attempt) {
      return res.status(404).json({ message: "Attempt not found" });
    }
    if (attempt.studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (attempt.status === "SUBMITTED") {
      return res.status(400).json({ message: "Attempt already submitted" });
    }

    attempt.answers = Array.isArray(answers) ? answers : attempt.answers;
    attempt.lastSavedAt = new Date();
    await attempt.save();
    res.json({ message: "Progress saved", remainingSeconds: getRemainingSeconds(attempt) });
  } catch (error) {
    res.status(500).json({ message: "Failed to save attempt" });
  }
};

const handleSubmitAttempt = async ({ attemptId, userId, autoSubmitted = false, req }) => {
  const attempt = await TestAttempt.findById(attemptId).populate({ path: "testId", populate: { path: "questions" } });
  if (!attempt) {
    return { status: 404, body: { message: "Attempt not found" } };
  }
  if (String(attempt.studentId) !== String(userId)) {
    return { status: 403, body: { message: "Access denied" } };
  }
  if (attempt.status === "SUBMITTED") {
    return {
      status: 200,
      body: {
        attempt,
        remainingSeconds: 0,
      },
    };
  }

  const questionDocs = attempt.testId.questions || [];
  const { totalScore, scoredAnswers } = scoreAttempt(questionDocs, attempt.answers);
  attempt.answers = scoredAnswers;
  attempt.score = totalScore;
  attempt.submittedAt = new Date();
  attempt.autoSubmitted = Boolean(autoSubmitted);
  attempt.status = "SUBMITTED";
  attempt.lastSavedAt = new Date();
  if (req) {
    attempt.ipAddress = getIpAddress(req);
    attempt.browserInfo = getBrowserInfo(req);
  }
  await attempt.save();

  const io = getIO();
  if (io) {
    io.to(String(userId)).emit("test_attempt_submitted", {
      attemptId: attempt._id,
      testId: attempt.testId._id,
      score: attempt.score,
      autoSubmitted: attempt.autoSubmitted,
      violations: attempt.violations || [],
    });
  }

  return {
    status: 200,
    body: {
      attempt,
      remainingSeconds: 0,
      score: attempt.score,
      autoSubmitted: attempt.autoSubmitted,
    },
  };
};

const submitAttempt = async (req, res) => {
  try {
    const result = await handleSubmitAttempt({
      attemptId: req.params.attemptId,
      userId: req.user._id,
      autoSubmitted: Boolean(req.body?.autoSubmitted),
      req,
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ message: "Failed to submit attempt" });
  }
};

const handleRecordTabSwitch = async ({ attemptId, userId, req, reason = "TAB_SWITCH" }) => {
  const attempt = await TestAttempt.findById(attemptId);
  if (!attempt) {
    return { status: 404, body: { message: "Attempt not found" } };
  }
  if (String(attempt.studentId) !== String(userId)) {
    return { status: 403, body: { message: "Access denied" } };
  }
  if (attempt.status === "SUBMITTED") {
    return { status: 200, body: { message: "Attempt already submitted", submitted: true } };
  }

  attempt.tabSwitchCount += 1;
  attempt.lastSavedAt = new Date();
  attempt.violations = Array.isArray(attempt.violations) ? attempt.violations : [];
  attempt.violations.push({ reason, timestamp: new Date() });
  if (req) {
    attempt.ipAddress = getIpAddress(req);
    attempt.browserInfo = getBrowserInfo(req);
  }

  if (attempt.tabSwitchCount > TAB_SWITCH_LIMIT) {
    await attempt.save();
    const submitResult = await handleSubmitAttempt({
      attemptId,
      userId,
      autoSubmitted: true,
      req,
    });
    return {
      status: 200,
      body: {
        tabSwitchCount: TAB_SWITCH_LIMIT + 1,
        remainingAttempts: 0,
        autoSubmitted: true,
        message: "Maximum tab switch limit exceeded. Your test has been auto-submitted.",
        submitted: true,
        submitResult: submitResult.body,
      },
    };
  }

  await attempt.save();
  const remainingAttempts = Math.max(0, TAB_SWITCH_LIMIT - attempt.tabSwitchCount);

  const io = getIO();
  if (io) {
    io.to(String(userId)).emit("test_violation_update", {
      attemptId,
      tabSwitchCount: attempt.tabSwitchCount,
      remainingAttempts,
      autoSubmitted: false,
      reason,
      timestamp: new Date(),
    });
  }

  return {
    status: 200,
    body: {
      tabSwitchCount: attempt.tabSwitchCount,
          violations: attempt.violations || [],
      remainingAttempts,
      autoSubmitted: false,
      reason,
      message: `You have switched tabs. Remaining attempts: ${remainingAttempts}`,
      submitted: false,
    },
  };
};

const recordTabSwitch = async (req, res) => {
  try {
    const result = await handleRecordTabSwitch({
      attemptId: req.params.attemptId,
      userId: req.user._id,
      req,
      reason: req.body?.reason || "TAB_SWITCH",
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ message: "Failed to record tab switch" });
  }
};

const getTestSummary = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }
    if (test.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const attempts = await TestAttempt.find({ testId: test._id });
    const totalAttempts = attempts.length;
    const scores = attempts.map((attempt) => attempt.score).filter((score) => Number.isFinite(score));
    const averageScore = scores.length ? scores.reduce((acc, score) => acc + score, 0) / scores.length : 0;
    const highestScore = scores.length ? Math.max(...scores) : 0;
    const studentsWithViolations = new Set(
      attempts.filter((attempt) => attempt.tabSwitchCount > 0).map((attempt) => String(attempt.studentId))
    ).size;
    const autoSubmittedTests = attempts.filter((attempt) => attempt.autoSubmitted).length;

    res.json({
      totalAttempts,
      averageScore: Number(averageScore.toFixed(2)),
      highestScore,
      studentsWithViolations,
      autoSubmittedTests,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load test summary" });
  }
};

module.exports = {
  createTest,
  updateTest,
  deleteTest,
  publishTest,
  closeTest,
  listTests,
  getTestById,
  getTeacherAttempts,
  getTeacherSummary,
  startAttempt,
  getAttemptById,
  saveAttemptAnswers,
  submitAttempt,
  recordTabSwitch,
  handleRecordTabSwitch,
  handleSubmitAttempt,
  getTestSummary,
};