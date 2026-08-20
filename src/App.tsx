import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, type Role } from './auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Institutions } from './pages/Institutions';
import { Exams } from './pages/Exams';
import { ExamEvaluate } from './pages/ExamEvaluate';
import { Students } from './pages/Students';
import { Classes } from './pages/Classes';
import { Outcomes } from './pages/Outcomes';
import { Worksheets } from './pages/Worksheets';
import { Reports } from './pages/Reports';
import { Children } from './pages/Children';
import { Transfers } from './pages/Transfers';
import { OpticalPrepare } from './pages/OpticalPrepare';
import { Calibration } from './pages/Calibration';
import { Opticals } from './pages/Opticals';
import { UsersPage } from './pages/Users';
import { Seasons } from './pages/Seasons';
import { TeacherAssignments } from './pages/TeacherAssignments';

function RoleGate({ allowed, children }: { allowed: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !allowed.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App(){
 const {user,loading}=useAuth(); const location=useLocation();
 if(loading)return <div className="boot">Ölçme Platformu yükleniyor…</div>;
 if(!user&&location.pathname!=='/login')return <Navigate to="/login" replace/>;
 if(user&&location.pathname==='/login')return <Navigate to="/" replace/>;
 return <Routes>
  <Route path="/login" element={<Login/>}/>
  <Route element={<Layout/>}>
   <Route index element={<Dashboard/>}/>
   <Route path="institutions" element={<RoleGate allowed={['SUPER_ADMIN']}><Institutions/></RoleGate>}/>
   <Route path="exams" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER']}><Exams/></RoleGate>}/>
   <Route path="exams/:examId/evaluate" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><ExamEvaluate/></RoleGate>}/>
   <Route path="students" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Students/></RoleGate>}/>
   <Route path="users" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><UsersPage/></RoleGate>}/>
   <Route path="teacher-assignments" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><TeacherAssignments/></RoleGate>}/>
   <Route path="seasons" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Seasons/></RoleGate>}/>
   <Route path="classes" element={<RoleGate allowed={['TEACHER','GUIDANCE_TEACHER']}><Classes/></RoleGate>}/>
   <Route path="outcomes" element={<RoleGate allowed={['TEACHER','GUIDANCE_TEACHER','STUDENT']}><Outcomes/></RoleGate>}/>
   <Route path="worksheets" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT']}><Worksheets/></RoleGate>}/>
   <Route path="reports" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','GUIDANCE_TEACHER','PARENT']}><Reports/></RoleGate>}/>
   <Route path="my-results" element={<RoleGate allowed={['STUDENT']}><Reports/></RoleGate>}/>
   <Route path="children" element={<RoleGate allowed={['PARENT']}><Children/></RoleGate>}/>
   <Route path="transfers" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Transfers/></RoleGate>}/>
   <Route path="optical-prepare" element={<RoleGate allowed={['INSTITUTION_MANAGER']}><OpticalPrepare/></RoleGate>}/>
   <Route path="calibration" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Calibration/></RoleGate>}/>
   <Route path="opticals" element={<RoleGate allowed={['SUPER_ADMIN']}><Opticals/></RoleGate>}/>
   <Route path="*" element={<Navigate to="/" replace/>}/>
  </Route>
 </Routes>
}
