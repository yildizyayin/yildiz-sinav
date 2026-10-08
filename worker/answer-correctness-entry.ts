import curriculumApp from './curriculum-admin-entry';

// Native evaluation already handles printed positions, accepted answers and
// excluded questions inside the exam lock. A post-response repair would write
// after that lock is released and could corrupt a newly published snapshot.
export default curriculumApp;
