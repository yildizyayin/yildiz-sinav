import { lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, type Role } from './auth';
import { Layout } from './components/Layout';
const Login = lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const StudentStandardHome = lazy(() => import('./pages/StudentStandardHome').then(module => ({ default: module.StudentStandardHome })));
const StudentTargetsV2 = lazy(() => import('./pages/StudentTargetsV2').then(module => ({ default: module.StudentTargetsV2 })));
const StudentExperienceSettings = lazy(() => import('./pages/StudentExperienceSettings').then(module => ({ default: module.StudentExperienceSettings })));
const StudentGames = lazy(() => import('./pages/StudentGames').then(module => ({ default: module.StudentGames })));
const StudentQuestionReview = lazy(() => import('./pages/StudentQuestionReview').then(module => ({ default: module.StudentQuestionReview })));
const StudentQuestionPractice = lazy(() => import('./pages/StudentQuestionPractice').then(module => ({ default: module.StudentQuestionPractice })));
const StudentBooks = lazy(() => import('./pages/StudentBooks').then(module => ({ default: module.StudentBooks })));
const StandardReadiness = lazy(() => import('./pages/StandardReadiness').then(module => ({ default: module.StandardReadiness })));
const SuperAdminStandardHome = lazy(() => import('./pages/StandardRoleHomes').then(module => ({ default: module.SuperAdminStandardHome })));
const TeacherStandardHome = lazy(() => import('./pages/StandardRoleHomes').then(module => ({ default: module.TeacherStandardHome })));
const ParentStandardHome = lazy(() => import('./pages/StandardRoleHomes').then(module => ({ default: module.ParentStandardHome })));
const InstitutionPanelV2 = lazy(() => import('./pages/InstitutionPanelV2').then(module => ({ default: module.InstitutionPanelV2 })));
const Institutions = lazy(() => import('./pages/Institutions').then(module => ({ default: module.Institutions })));
const Exams = lazy(() => import('./pages/Exams').then(module => ({ default: module.Exams })));
const ExamCenter = lazy(() => import('./pages/ExamCenter').then(module => ({ default: module.ExamCenter })));
const ExamEvaluate = lazy(() => import('./pages/ExamEvaluate').then(module => ({ default: module.ExamEvaluate })));
const ExamDefinitions = lazy(() => import('./pages/ExamDefinitions').then(module => ({ default: module.ExamDefinitions })));
const StudentExamResults = lazy(() => import('./pages/StudentExamResults').then(module => ({ default: module.StudentExamResults })));
const Students = lazy(() => import('./pages/Students').then(module => ({ default: module.Students })));
const Classes = lazy(() => import('./pages/Classes').then(module => ({ default: module.Classes })));
const Outcomes = lazy(() => import('./pages/Outcomes').then(module => ({ default: module.Outcomes })));
const Worksheets = lazy(() => import('./pages/Worksheets').then(module => ({ default: module.Worksheets })));
const WorksheetAdmin = lazy(() => import('./pages/WorksheetAdmin').then(module => ({ default: module.WorksheetAdmin })));
const Reports = lazy(() => import('./pages/Reports').then(module => ({ default: module.Reports })));
const Children = lazy(() => import('./pages/Children').then(module => ({ default: module.Children })));
const Transfers = lazy(() => import('./pages/Transfers').then(module => ({ default: module.Transfers })));
const OpticalPrepare = lazy(() => import('./pages/OpticalPrepare').then(module => ({ default: module.OpticalPrepare })));
const Calibration = lazy(() => import('./pages/Calibration').then(module => ({ default: module.Calibration })));
const Opticals = lazy(() => import('./pages/Opticals').then(module => ({ default: module.Opticals })));
const UsersPage = lazy(() => import('./pages/Users').then(module => ({ default: module.UsersPage })));
const Seasons = lazy(() => import('./pages/Seasons').then(module => ({ default: module.Seasons })));
const TeacherAssignments = lazy(() => import('./pages/TeacherAssignments').then(module => ({ default: module.TeacherAssignments })));
const AccessAccounts = lazy(() => import('./pages/AccessAccounts').then(module => ({ default: module.AccessAccounts })));
const CurriculumAdmin = lazy(() => import('./pages/CurriculumAdmin').then(module => ({ default: module.CurriculumAdmin })));
const CameraTestSheet = lazy(() => import('./pages/CameraTestSheet').then(module => ({ default: module.CameraTestSheet })));
const Profile = lazy(() => import('./pages/Profile').then(module => ({ default: module.Profile })));
const Notifications = lazy(() => import('./pages/Notifications').then(module => ({ default: module.Notifications })));
const ActivationRequests = lazy(() => import('./pages/ActivationRequests').then(module => ({ default: module.ActivationRequests })));
const WrongAnswers = lazy(() => import('./pages/WrongAnswers').then(module => ({ default: module.WrongAnswers })));
const WeeklySummary = lazy(() => import('./pages/WeeklySummary').then(module => ({ default: module.WeeklySummary })));
const BulkOperations = lazy(() => import('./pages/BulkOperations').then(module => ({ default: module.BulkOperations })));
const DemoMode = lazy(() => import('./pages/DemoMode').then(module => ({ default: module.DemoMode })));
const ScaleInfrastructure = lazy(() => import('./pages/ScaleInfrastructure').then(module => ({ default: module.ScaleInfrastructure })));
const Nibiru = lazy(() => import('./pages/Nibiru').then(module => ({ default: module.Nibiru })));
const NibiruAdmin = lazy(() => import('./pages/NibiruAdmin').then(module => ({ default: module.NibiruAdmin })));
const AgentCenter = lazy(() => import('./pages/AgentCenter').then(module => ({ default: module.AgentCenter })));
const Licenses = lazy(() => import('./pages/Licenses').then(module => ({ default: module.Licenses })));
const AcademicTargetAdmin = lazy(() => import('./pages/AcademicTargetAdmin').then(module => ({ default: module.AcademicTargetAdmin })));
const OfficialQuestionIntelligenceAdmin = lazy(() => import('./pages/OfficialQuestionIntelligenceAdmin').then(module => ({ default: module.OfficialQuestionIntelligenceAdmin })));
const Announcements = lazy(() => import('./pages/Announcements').then(module => ({ default: module.Announcements })));
const WorksheetCalendar = lazy(() => import('./pages/WorksheetCalendar').then(module => ({ default: module.WorksheetCalendar })));
const FeatureLab = lazy(() => import('./pages/FeatureLab').then(module => ({ default: module.FeatureLab })));
const ContentCenter = lazy(() => import('./pages/ContentCenter').then(module => ({ default: module.ContentCenter })));
const StudentGrowthCenter = lazy(() => import('./pages/StudentGrowthCenter').then(module => ({ default: module.StudentGrowthCenter })));
const PremiumCenter = lazy(() => import('./pages/PremiumCenter').then(module => ({ default: module.PremiumCenter })));
const EnterpriseCenter = lazy(() => import('./pages/EnterpriseCenter').then(module => ({ default: module.EnterpriseCenter })));
const GuidanceTests = lazy(() => import('./pages/GuidanceTests').then(module => ({ default: module.GuidanceTests })));
const MembershipOrders = lazy(() => import('./pages/MembershipOrders').then(module => ({ default: module.MembershipOrders })));
const CompletionCenter = lazy(() => import('./pages/CompletionCenter').then(module => ({ default: module.CompletionCenter })));
const ThemeManagement = lazy(() => import('./pages/ThemeManagement').then(module => ({ default: module.ThemeManagement })));
const AttendanceCenter = lazy(() => import('./pages/AttendanceCenter').then(module => ({ default: module.AttendanceCenter })));
const AssignmentsCenter = lazy(() => import('./pages/AssignmentsCenter').then(module => ({ default: module.AssignmentsCenter })));
const MarketingHome = lazy(() => import('./pages/MarketingHome').then(module => ({ default: module.MarketingHome })));
const ResultPortal = lazy(() => import('./pages/ResultPortal').then(module => ({ default: module.ResultPortal })));
const ResultNetworkAdmin = lazy(() => import('./pages/ResultNetworkAdmin').then(module => ({ default: module.ResultNetworkAdmin })));

const ALL_ROLES: Role[] = ['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT','PARENT'];
function RoleGate({allowed,children}:{allowed:Role[];children:React.ReactNode}){const{user}=useAuth();if(!user||!allowed.includes(user.role))return <Navigate to="/" replace/>;return <>{children}</>}
function Home(){const{user}=useAuth();if(user?.role==='SUPER_ADMIN')return <SuperAdminStandardHome/>;if(user?.role==='INSTITUTION_MANAGER')return <InstitutionPanelV2/>;if(user?.role==='TEACHER'||user?.role==='GUIDANCE_TEACHER')return <TeacherStandardHome/>;if(user?.role==='STUDENT')return <StudentStandardHome/>;if(user?.role==='PARENT')return <ParentStandardHome/>;return null}

export default function App(){
 const{user,loading}=useAuth();const location=useLocation();
 const hostname=typeof window==='undefined'?'':window.location.hostname.toLowerCase();
 const isMarketingPreview=hostname.startsWith('anunex-web.')&&hostname.endsWith('.workers.dev');
 const isResultPreview=hostname.startsWith('anunex-results.')&&hostname.endsWith('.workers.dev');
 const isResultHost=hostname==='sonuc.anunex.com'||isResultPreview||new URLSearchParams(location.search).get('site')==='results';
 const isMarketingHost=hostname==='anunex.com'||hostname==='www.anunex.com'||isMarketingPreview||new URLSearchParams(location.search).get('site')==='marketing';
 if(isResultHost)return <ResultPortal/>;
 if(isMarketingHost)return <MarketingHome/>;
 if(loading)return <div className="boot">Anunex yükleniyor…</div>;
 if(!user&&location.pathname!=='/login')return <Navigate to="/login" replace/>;
 if(user&&location.pathname==='/login')return <Navigate to="/" replace/>;
 return <Routes>
  <Route path="/login" element={<Login/>}/><Route element={<Layout/>}><Route index element={<Home/>}/>
  <Route path="standard-readiness" element={<RoleGate allowed={['SUPER_ADMIN']}><StandardReadiness/></RoleGate>}/>
  <Route path="theme-management" element={<RoleGate allowed={['SUPER_ADMIN']}><ThemeManagement/></RoleGate>}/>
  <Route path="attendance" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER']}><AttendanceCenter/></RoleGate>}/>
  <Route path="assignments" element={<RoleGate allowed={['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT']}><AssignmentsCenter/></RoleGate>}/>
  <Route path="completion-center" element={<RoleGate allowed={['SUPER_ADMIN']}><CompletionCenter/></RoleGate>}/><Route path="membership-orders" element={<RoleGate allowed={['SUPER_ADMIN']}><MembershipOrders/></RoleGate>}/>
  <Route path="nibiru" element={<RoleGate allowed={ALL_ROLES}><Nibiru/></RoleGate>}/><Route path="nibiru-admin" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><NibiruAdmin/></RoleGate>}/><Route path="agent-center" element={<RoleGate allowed={['SUPER_ADMIN']}><AgentCenter/></RoleGate>}/>
  <Route path="academic-target" element={<RoleGate allowed={['STUDENT']}><StudentTargetsV2/></RoleGate>}/><Route path="student-settings" element={<RoleGate allowed={['STUDENT']}><StudentExperienceSettings/></RoleGate>}/><Route path="student-games" element={<RoleGate allowed={['STUDENT']}><StudentGames/></RoleGate>}/><Route path="question-practice" element={<RoleGate allowed={['STUDENT']}><StudentQuestionPractice/></RoleGate>}/><Route path="question-review" element={<RoleGate allowed={['STUDENT']}><StudentQuestionReview/></RoleGate>}/><Route path="my-books" element={<RoleGate allowed={['STUDENT']}><StudentBooks/></RoleGate>}/>
  <Route path="academic-target-admin" element={<RoleGate allowed={['SUPER_ADMIN']}><AcademicTargetAdmin/></RoleGate>}/><Route path="official-question-intelligence" element={<RoleGate allowed={['SUPER_ADMIN']}><OfficialQuestionIntelligenceAdmin/></RoleGate>}/>
  <Route path="announcements" element={<RoleGate allowed={['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER']}><Announcements/></RoleGate>}/><Route path="worksheet-calendar" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER']}><WorksheetCalendar/></RoleGate>}/><Route path="licenses" element={<RoleGate allowed={['SUPER_ADMIN']}><Licenses/></RoleGate>}/><Route path="profile" element={<RoleGate allowed={ALL_ROLES}><Profile/></RoleGate>}/><Route path="notifications" element={<RoleGate allowed={ALL_ROLES}><Notifications/></RoleGate>}/>
  <Route path="result-network" element={<RoleGate allowed={['SUPER_ADMIN']}><ResultNetworkAdmin/></RoleGate>}/>
  <Route path="institutions" element={<RoleGate allowed={['SUPER_ADMIN']}><Institutions/></RoleGate>}/><Route path="curriculum" element={<RoleGate allowed={['SUPER_ADMIN']}><CurriculumAdmin/></RoleGate>}/><Route path="exam-center" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><ExamCenter/></RoleGate>}/><Route path="exams" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER']}><Exams/></RoleGate>}/><Route path="exam-definitions" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><ExamDefinitions/></RoleGate>}/><Route path="exams/:examId/evaluate" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><ExamEvaluate/></RoleGate>}/><Route path="camera-test" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><CameraTestSheet/></RoleGate>}/>
  <Route path="students" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Students/></RoleGate>}/><Route path="activation-requests" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><ActivationRequests/></RoleGate>}/><Route path="users" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><UsersPage/></RoleGate>}/><Route path="access-accounts" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><AccessAccounts/></RoleGate>}/><Route path="teacher-assignments" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><TeacherAssignments/></RoleGate>}/><Route path="seasons" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Seasons/></RoleGate>}/>
  <Route path="classes" element={<RoleGate allowed={['TEACHER','GUIDANCE_TEACHER']}><Classes/></RoleGate>}/><Route path="outcomes" element={<RoleGate allowed={['TEACHER','GUIDANCE_TEACHER','STUDENT']}><Outcomes/></RoleGate>}/><Route path="worksheets" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT']}><Worksheets/></RoleGate>}/><Route path="worksheet-admin" element={<RoleGate allowed={['SUPER_ADMIN']}><WorksheetAdmin/></RoleGate>}/><Route path="reports" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','PARENT']}><Reports/></RoleGate>}/>
  <Route path="my-results" element={<RoleGate allowed={['STUDENT']}><StudentExamResults/></RoleGate>}/><Route path="student-report" element={<RoleGate allowed={['STUDENT']}><Reports/></RoleGate>}/><Route path="wrong-answers" element={<RoleGate allowed={['STUDENT']}><WrongAnswers/></RoleGate>}/><Route path="children" element={<RoleGate allowed={['PARENT']}><Children/></RoleGate>}/><Route path="weekly-summary" element={<RoleGate allowed={['PARENT']}><WeeklySummary/></RoleGate>}/>
  <Route path="transfers" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Transfers/></RoleGate>}/><Route path="optical-prepare" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><OpticalPrepare/></RoleGate>}/><Route path="calibration" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><Calibration/></RoleGate>}/><Route path="opticals" element={<RoleGate allowed={['SUPER_ADMIN']}><Opticals/></RoleGate>}/><Route path="bulk-operations" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><BulkOperations/></RoleGate>}/><Route path="demo-mode" element={<RoleGate allowed={['SUPER_ADMIN']}><DemoMode/></RoleGate>}/><Route path="scale" element={<RoleGate allowed={['SUPER_ADMIN']}><ScaleInfrastructure/></RoleGate>}/><Route path="feature-lab" element={<RoleGate allowed={['SUPER_ADMIN']}><FeatureLab/></RoleGate>}/>
  <Route path="content-center" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER']}><ContentCenter/></RoleGate>}/><Route path="student-growth" element={<RoleGate allowed={['STUDENT']}><StudentGrowthCenter/></RoleGate>}/><Route path="premium" element={<RoleGate allowed={['STUDENT']}><PremiumCenter/></RoleGate>}/><Route path="enterprise" element={<RoleGate allowed={['SUPER_ADMIN','INSTITUTION_MANAGER']}><EnterpriseCenter/></RoleGate>}/><Route path="guidance-tests" element={<RoleGate allowed={['STUDENT','GUIDANCE_TEACHER']}><GuidanceTests/></RoleGate>}/>
  <Route path="*" element={<Navigate to="/" replace/>}/></Route></Routes>
}
