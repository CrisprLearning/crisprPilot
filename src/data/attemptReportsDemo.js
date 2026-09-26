const studentPool = [
  ['STU-001', 'Rajesh Kumar'],
  ['STU-002', 'Priya Sharma'],
  ['STU-003', 'Amit Patel'],
  ['STU-004', 'Sneha Reddy'],
  ['STU-005', 'Vikram Singh'],
  ['STU-006', 'Anjali Gupta'],
  ['STU-007', 'Arjun Mehta'],
  ['STU-008', 'Divya Iyer'],
  ['STU-009', 'Karan Verma'],
  ['STU-010', 'Neha Joshi'],
  ['STU-011', 'Rahul Desai'],
  ['STU-012', 'Pooja Nair'],
];

export const availableCourses = [
  { id: 'CR001', name: 'IAT 2026 - Exclusive 1 Year Course', code: 'IAT-2026' },
  { id: 'CR002', name: 'NEET 2026 Complete Preparation', code: 'NEET-2026' },
  { id: 'CR003', name: 'JEE Advanced 2026 Crash Course', code: 'JEE-2026' },
  { id: 'CR004', name: 'Foundation Course - Class 11', code: 'FOUND-11' },
];

export const availableBatches = [
  { id: 'BATCH-001', name: 'IAT 2026 - Batch A', courseId: 'CR001', students: ['STU-001', 'STU-002', 'STU-003'] },
  { id: 'BATCH-002', name: 'IAT 2026 - Batch B', courseId: 'CR001', students: ['STU-004', 'STU-005', 'STU-006'] },
  { id: 'BATCH-003', name: 'NEET 2026 - Morning Batch', courseId: 'CR002', students: ['STU-007', 'STU-008', 'STU-009'] },
  { id: 'BATCH-004', name: 'JEE 2026 - Weekend Batch', courseId: 'CR003', students: ['STU-010', 'STU-011'] },
  { id: 'BATCH-005', name: 'Foundation - Batch One', courseId: 'CR004', students: ['STU-012'] },
];

export function generateAttempts({ totalQuestions = 60, maximumMarks = 240, count = 12 }) {
  const now = Date.now();

  return Array.from({ length: count }, (_, index) => {
    const [studentId, studentName] = studentPool[index % studentPool.length];
    const course = availableCourses[index % availableCourses.length];
    const scoreRatio = Math.max(0.32, 0.9 - index * 0.045);
    const score = Math.round(maximumMarks * scoreRatio);
    const startedAt = new Date(now - (index + 1) * 36e5 * 9).toISOString();
    const completedAt = index % 5 === 4 ? null : new Date(now - (index + 1) * 36e5 * 7.5).toISOString();
    const correctAnswers = Math.round(totalQuestions * Math.min(0.88, 0.42 + index * 0.03));
    const incorrectAnswers = completedAt ? Math.max(0, Math.round(totalQuestions * 0.18) - index) : 0;
    const unattempted = Math.max(0, totalQuestions - correctAnswers - incorrectAnswers);

    return {
      studentId,
      studentName,
      // Demo profile photo (CORS-enabled placeholder); the poster tool falls back to initials if unreachable.
      photoUrl: `https://api.dicebear.com/9.x/avataaars/png?size=400&seed=${encodeURIComponent(studentName)}`,
      studentEmail: `${studentName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      rollNumber: `R${2024000 + index + 1}`,
      courseId: course.id,
      startedAt,
      completedAt,
      status: completedAt ? 'completed' : 'in-progress',
      score: completedAt ? score : 0,
      correctAnswers: completedAt ? correctAnswers : 0,
      incorrectAnswers: completedAt ? incorrectAnswers : 0,
      unattempted: completedAt ? unattempted : totalQuestions,
    };
  });
}

export function ensureAttempts(entity, fallback) {
  if (entity?.attempts?.length) {
    return entity;
  }

  return {
    ...entity,
    attempts: generateAttempts({
      totalQuestions: entity?.totalQuestions || fallback.totalQuestions,
      maximumMarks: entity?.maximumMarks || fallback.maximumMarks,
      count: fallback.count || 12,
    }),
  };
}
