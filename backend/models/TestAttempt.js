const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    questionType: {
      type: String,
      enum: ["MCQ", "TRUE_FALSE", "SHORT_ANSWER"],
      required: true,
    },
    selectedOption: {
      type: String,
      default: "",
    },
    textAnswer: {
      type: String,
      default: "",
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
    marksAwarded: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const testAttemptSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
      index: true,
    },
    answers: {
      type: [answerSchema],
      default: [],
    },
    score: {
      type: Number,
      default: null,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    tabSwitchCount: {
      type: Number,
      default: 0,
    },
    autoSubmitted: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["IN_PROGRESS", "SUBMITTED"],
      default: "IN_PROGRESS",
      index: true,
    },
    lastSavedAt: {
      type: Date,
      default: Date.now,
    },
    ipAddress: {
      type: String,
      default: "",
    },
    browserInfo: {
      type: String,
      default: "",
    },
    violations: {
      type: [
        {
          reason: {
            type: String,
            required: true,
          },
          timestamp: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

testAttemptSchema.index(
  { studentId: 1, testId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "IN_PROGRESS" },
  }
);

module.exports =
  mongoose.models.TestAttempt || mongoose.model("TestAttempt", testAttemptSchema);