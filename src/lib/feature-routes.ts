const ROUTE_FEATURES:Record<string,string>={
  '/exam-center':'EXAM_CENTER','/exams':'EXAM_CENTER','/exam-definitions':'EXAM_CENTER',
  '/opticals':'OPTICAL','/optical-prepare':'OPTICAL','/camera-test':'OPTICAL','/calibration':'OPTICAL',
  '/content-center':'QUESTION_BANK','/enterprise':'ENTERPRISE','/attendance':'ATTENDANCE','/assignments':'ASSIGNMENTS',
  '/worksheets':'WORKSHEETS','/worksheet-admin':'WORKSHEETS','/worksheet-calendar':'WORKSHEETS',
  '/reports':'REPORTING','/student-report':'REPORTING','/my-results':'REPORTING','/outcomes':'REPORTING',
  '/my-books':'PERSONAL_BOOKS','/wrong-answers':'ZERO_ERROR_BOOKLET','/student-games':'GAMES',
  '/student-growth':'LEARNING_GRAPH','/guidance-tests':'GUIDANCE_TESTS','/premium':'MEMBERSHIP','/nibiru-admin':'NIBIRU_CORE',
};

export function featureForPath(pathname:string):string|null{
  const exact=ROUTE_FEATURES[pathname];if(exact)return exact;
  if(/^\/exams\/[^/]+\/evaluate$/.test(pathname))return 'EXAM_CENTER';
  return null;
}

export const ROUTE_FEATURE_MATRIX=ROUTE_FEATURES;
