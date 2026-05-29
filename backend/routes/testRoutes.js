const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");
const {
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
  getTestSummary,
} = require("../controllers/testController");

router.use(protect);

router.get("/teacher/summary", authorizeRoles("teacher"), getTeacherSummary);
router.get("/", listTests);
router.post("/", authorizeRoles("teacher"), createTest);
router.get("/attempts/:attemptId", getAttemptById);
router.patch("/attempts/:attemptId/answers", authorizeRoles("student"), saveAttemptAnswers);
router.patch("/attempts/:attemptId/submit", authorizeRoles("student"), submitAttempt);
router.post("/attempts/:attemptId/tab-switch", authorizeRoles("student"), recordTabSwitch);

router.get("/:id", getTestById);
router.patch("/:id", authorizeRoles("teacher"), updateTest);
router.delete("/:id", authorizeRoles("teacher"), deleteTest);
router.patch("/:id/publish", authorizeRoles("teacher"), publishTest);
router.patch("/:id/close", authorizeRoles("teacher"), closeTest);
router.get("/:id/summary", authorizeRoles("teacher"), getTestSummary);
router.get("/:id/attempts", authorizeRoles("teacher"), getTeacherAttempts);
router.get("/:id/start", authorizeRoles("student"), startAttempt);

module.exports = router;