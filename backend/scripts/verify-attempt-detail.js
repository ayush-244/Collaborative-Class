const assert = require("assert");

const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:5000/api";

const fetchJson = async (url, options = {}) => {
  const { headers: inputHeaders, ...requestOptions } = options;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(inputHeaders || {}),
    },
    ...requestOptions,
  });

  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch (error) {
    body = text;
  }

  return { response, body };
};

const registerUser = async ({ name, email, password, role, section }) => {
  const { response, body } = await fetchJson(`${apiBaseUrl}/auth/register`, {
    method: "POST",
    body: JSON.stringify({ name, email, password, role, section }),
  });

  assert.strictEqual(response.status, 201, `Expected register 201, got ${response.status}: ${JSON.stringify(body)}`);
  assert.ok(body?.token, "Expected auth token from register response");
  return body;
};

const main = async () => {
  const stamp = Date.now();
  const teacherEmail = `teacher-${stamp}@example.com`;
  const studentEmail = `student-${stamp}@example.com`;
  const password = "Pass123!";

  const teacher = await registerUser({
    name: "Attempt Detail Teacher",
    email: teacherEmail,
    password,
    role: "teacher",
    section: "A",
  });

  const student = await registerUser({
    name: "Attempt Detail Student",
    email: studentEmail,
    password,
    role: "student",
    section: "A",
  });

  const teacherHeaders = { Authorization: `Bearer ${teacher.token}` };
  const studentHeaders = { Authorization: `Bearer ${student.token}` };
  const now = new Date();
  const testPayload = {
    title: `Attempt Detail Test ${stamp}`,
    description: "Reproducible endpoint test",
    duration: 10,
    totalMarks: 10,
    startDateTime: new Date(now.getTime() - 60 * 1000).toISOString(),
    endDateTime: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    section: "A",
    questions: [
      {
        type: "MCQ",
        prompt: "2 + 2 = ?",
        options: ["3", "4"],
        correctAnswer: "4",
        marks: 10,
        order: 0,
      },
    ],
  };

  const { response: createResponse, body: createdTest } = await fetchJson(`${apiBaseUrl}/tests`, {
    method: "POST",
    headers: teacherHeaders,
    body: JSON.stringify(testPayload),
  });

  assert.strictEqual(createResponse.status, 201, `Expected create test 201, got ${createResponse.status}: ${JSON.stringify(createdTest)}`);
  assert.ok(createdTest?._id, "Expected test id from create response");

  const { response: publishResponse, body: publishBody } = await fetchJson(`${apiBaseUrl}/tests/${createdTest._id}/publish`, {
    method: "PATCH",
    headers: teacherHeaders,
    body: JSON.stringify({}),
  });

  assert.strictEqual(publishResponse.status, 200, `Expected publish 200, got ${publishResponse.status}: ${JSON.stringify(publishBody)}`);

  const { response: startResponse, body: startBody } = await fetchJson(`${apiBaseUrl}/tests/${createdTest._id}/start`, {
    method: "GET",
    headers: studentHeaders,
  });

  assert.strictEqual(startResponse.status, 200, `Expected start 200, got ${startResponse.status}: ${JSON.stringify(startBody)}`);
  assert.ok(startBody?.attempt?._id, "Expected attempt id from start response");

  const attemptId = startBody.attempt._id;
  const { response: detailResponse, body: detailBody } = await fetchJson(`${apiBaseUrl}/tests/attempts/${attemptId}`, {
    method: "GET",
    headers: teacherHeaders,
  });

  assert.strictEqual(detailResponse.status, 200, `Expected attempt detail 200, got ${detailResponse.status}: ${JSON.stringify(detailBody)}`);
  assert.strictEqual(detailBody?._id, attemptId, "Expected returned attempt to match requested attempt id");

  console.log(JSON.stringify({
    ok: true,
    teacherId: teacher._id,
    studentId: student._id,
    testId: createdTest._id,
    attemptId,
    detailStatus: detailResponse.status,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});