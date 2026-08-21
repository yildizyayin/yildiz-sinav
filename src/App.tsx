import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, type Role } from './auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { InstitutionPanelV2 } from './pages/InstitutionPanelV2';
import { Institutions } from './pages/Institutions';
import { Exams } from './pages/Exams';
import { ExamEvaluate } from './pages/ExamEvaluate';
import { ExamDefinitions } from './pages/ExamDefinitions';
import { Students } from './pages/Students';
import { Classes } from './pages/Classes';
import { Outcomes } from './pages/Outcomes';
import { Worksheets } from './pages/Worksheets';
import { WorksheetAdmin } from './pages/WorksheetAdmin';
import { Reports } from './pages/Reports';
import { Children } from './pages/Children';
import { Transfers } from './pages/Transfers';
import { OpticalPrepare } from './pages/OpticalPrepare';
import { Calibration } from './pages/Calibration';
import { Opticals } from './pages/Opticals';
import { UsersPage } from './pages/Users';
import { Seasons } from './pages/Seasons';
import { TeacherAssignments } from './pages/TeacherAssignments';
import { AccessAccounts } from './pages/AccessAccounts';
import { CurriculumAdmin } from './pages/CurriculumAdmin';
import { CameraTestSheet } from './pages/CameraTestSheet';
import { Profile } from './pages/Profile';
import { Notifications } from './pages/Notifications';
import { ActivationRequests } from './pages/ActivationRequests';
import { WrongAnswers } from './pages/WrongAnswers';
import { WeeklySummary } from './pages/WeeklySummary';
import { BulkOperations } from './pages/BulkOperations';
import { DemoMode } from './pages/DemoMode';
import { ScaleInfrastructure } from './pages/ScaleInfrastructure';
import { Nibiru } from './pages/Nibiru';
import { NibiruAdmin } from './pages/NibiruAdmin';
import { Licenses } from './pages/Licenses';
import { AcademicTarget } from './pages/AcademicTarget';
import { AcademicTargetAdmin } from './pages/AcademicTargetAdmin';
import { Announcements } from './pages/Announcements';
import { WorksheetCalendar } from './pages/WorksheetCalendar';

const ALL_ROLES: Role[] = ['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT','PARENT'];

function RoleGate({ allowed, children }: { allowed: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !allowed.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Home(){const{user}=useAuth();return user?.role==='INSTITUTION_MANAGER'?<InstitutionPanelV2/>:<Dashboard/>}

export default function App(){
 const {user,loading}=useAuth(); const location=useLocation();
 if(loading)return <div className="boot">Ölçme Platformu yükleniyor…</div>;
 if(!user&&location.pathname!=='/login')return <Navigate to="/login" replace/>;
 if(user&&location.pathname==='/login')return <Navigate to="/" replace/>;
 return <Routes>
  <Route path="/login" element={<Login/>}/>
  <Route element={<Layout/>}>
   <Route index element={<Home/>}/>
   <Route path="nibiru" element={<RoleGate allowed={ALL_ROLES}><Nibiru/></RoleGate>}/>
   <Route path="nibiru-admin" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><NibiruAdmin/></RoleGate>}/>
   <Route path="academic-target" element={<RoleGate allowed={['STUDENT']}><AcademicTarget/></RoleGate>}/>
   <Route path="academic-target-admin" element={<RoleGate allowed={['SUPER_ADMIN']}><AcademicTargetAdmin/></RoleGate>}/>
   <Route path="announcements" element={<RoleGate allowed={['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER']}><Announcements/></RoleGate>}/>
   <Route path="worksheet-calendar" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER']}><WorksheetCalendar/></RoleGate>}/>
   <Route path="licenses" element={<RoleGate allowed={['SUPER_ADMIN']}><Licenses/></RoleGate>}/>
   <Route path="profile" element={<RoleGate allowed={ALL_ROLES}><Profile/></RoleGate>}/>
   <Route path="notifications" element={<RoleGate allowed={ALL_ROLES}><Notifications/></RoleGate>}/>
   <Route path="institutions" element={<RoleGate allowed={['SUPER_ADMIN']}><Institutions/></RoleGate>}/>
   <Route path="curriculum" element={<RoleGate allowed={['SUPER_ADMIN']}><CurriculumAdmin/></RoleGate>}/>
   <Route path="exams" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER']}><Exams/></RoleGate>}/>
   <Route path="exam-definitions" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><ExamDefinitions/></RoleGate>}/>
   <Route path="exams/:examId/evaluate" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><ExamEvaluate/></RoleGate>}/>
   <Route path="camera-test" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><CameraTestSheet/></RoleGate>}/>
   <Route path="students" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Students/></RoleGate>}/>
   <Route path="activation-requests" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><ActivationRequests/></RoleGate>}/>
   <Route path="users" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><UsersPage/></RoleGate>}/>
   <Route path="access-accounts" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><AccessAccounts/></RoleGate>}/>
   <Route path="teacher-assignments" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><TeacherAssignments/></RoleGate>}/>
   <Route path="seasons" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Seasons/></RoleGate>}/>
   <Route path="classes" element={<RoleGate allowed={['TEACHER','GUIDANCE_TEACHER']}><Classes/></RoleGate>}/>
   <Route path="outcomes" element={<RoleGate allowed={['TEACHER','GUIDANCE_TEACHER','STUDENT']}><Outcomes/></RoleGate>}/>
   <Route path="worksheets" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT']}><Worksheets/></RoleGate>}/>
   <Route path="worksheet-admin" element={<RoleGate allowed={['SUPER_ADMIN']}><WorksheetAdmin/></RoleGate>}/>
   <Route path="reports" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','PARENT']}><Reports/></RoleGate>}/>
   <Route path="my-results" element={<RoleGate allowed={['STUDENT']}><Reports/></RoleGate>}/>
   <Route path="wrong-answers" element={<RoleGate allowed={['STUDENT']}><WrongAnswers/></RoleGate>}/>
   <Route path="children" element={<RoleGate allowed={['PARENT']}><Children/></RoleGate>}/>
   <Route path="weekly-summary" element={<RoleGate allowed={['PARENT']}><WeeklySummary/></RoleGate>}/>
   <Route path="transfers" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Transfers/></RoleGate>}/>
   <Route path="optical-prepare" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><OpticalPrepare/></RoleGate>}/>
   <Route path="calibration" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Calibration/></RoleGate>}/>
   <Route path="opticals" element={<RoleGate allowed={['SUPER_ADMIN']}><Opticals/></RoleGate>}/>
   <Route path="bulk-operations" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><BulkOperations/></RoleGate>}/>
   <Route path="demo-mode" element={<RoleGate allowed={['SUPER_ADMIN']}><DemoMode/></RoleGate>}/>
   <Route path="scale" element={<RoleGate allowed={['SUPER_ADMIN']}><ScaleInfrastructure/></RoleGate>}/>
   <Route path="*" element={<Navigate to="/" replace/>}/>
  </Route>
 </Routes>
}
